**Race Order Realtime: Avoiding Double Events on New Race Insert**

- Problem: New race insert emits two realtime updates — first with `raceOrder = 0/null`, then a second after recalculation sets the final order.
- Cause: `IngestRace` saves the new race, then `RecalculateRaceOrder` updates `raceOrder` via DAO (required to trigger realtime), producing an extra event for the same record.

**Constraints**
- Use DAO `FindRecordById` + `Save` to trigger realtime subscriptions when mutating records.
- Keep ingestion atomic: all DB ops run in a single `app.RunInTransaction` and use `txApp`.
- Avoid long/slow work inside the transaction (network I/O stays outside).
- Only one writer/transaction at a time (PocketBase single writer), which simplifies race conditions.

**Options Considered**
- Precompute `raceOrder` on insert: Compute the correct order for the new race before the first save and include it in the insert. Recalculate after to fix other races, but the new race won’t change (so it won’t emit a second event).
- Batch UPDATE only: Insert then raw SQL update. Doesn’t work for realtime because DAO save is needed to notify clients.
- Suppress/ignore initial event in clients: Adds client complexity; still emits unnecessary DB events.
- Silent/internal save if supported: Not available in our constraints; also hides meaningful writes from subscribers.

**Recommended Approach: Precompute `raceOrder` on Insert**
- Compute the new race’s final `raceOrder` prior to the initial save using a single COUNT query that excludes invalid races and orders by `(round.order, race.raceNumber)`.
- Insert the race with that `raceOrder` set in the same transaction.
- Then call `RecalculateRaceOrder(txApp, eventPBID)` to adjust existing races that need to shift; it will skip the new race because its `raceOrder` is already correct.

**Computation**
- Inputs: `eventPBID`, the new race’s `round.order` (via `roundPBID`), and `raceNumber`.
- Query outline:
  - Resolve `roundOrder` for the new race: `SELECT "order" FROM rounds WHERE id = {:roundPBID}`.
  - Count existing valid races preceding the new race:
    `SELECT COUNT(1) FROM races r LEFT JOIN rounds rd ON r.round = rd.id WHERE r.event = {:eventId} AND r.valid = 1 AND (rd."order" < {:roundOrder} OR (rd."order" = {:roundOrder} AND r.raceNumber < {:raceNumber}))`.
  - New `raceOrder = count + 1`.
- Set this value on the very first save of the new race.

**Flow (Inside Transaction)**
- Fetch remote race data outside TX.
- `RunInTransaction(func(txApp core.App) error {`
  - Compute `roundOrder` and `newOrder` as above using `txApp.DB()`.
  - Upsert race with fields including `raceOrder: newOrder`.
  - Upsert nested entities (pilotChannels, detections, laps, gamePoints).
  - Call `RecalculateRaceOrder(txApp, eventPBID)` to adjust existing races only; implementation already updates only when values differ and uses DAO saves for realtime.
`})`

**Why This Works**
- The new race is saved once with the final `raceOrder`, so only a single realtime event is emitted for it.
- Other races that need to shift will emit at most one update each — expected behavior.
- PocketBase’s single-writer model avoids concurrent inserts generating inconsistent counts.

**Edge Cases**
- Invalid races: Always `raceOrder = 0` and excluded from the count.
- Exact duplicates in ordering tuple: If two races share the same `(round.order, raceNumber)`, add a stable tie-breaker (e.g., by `sourceId`) in both COUNT and window function to keep order deterministic.
- Renumbering a race: If `raceNumber` changes on an existing race, `RecalculateRaceOrder` still corrects placement; no double event because we update once per record.
- Bulk backfills: Repeated inserts are serialized; each new race gets its final order on insert, while the recalculation step fixes any drift created by prior inserts.

**Implementation Notes**
- Add a helper `ComputeRaceOrderForNew(app core.App, eventPBID, roundPBID string, raceNumber int) (int, error)` to concentrate the COUNT logic.
- Use this helper only when inserting a new race (detectable in `Upserter` or by a preliminary lookup).
- Keep `RecalculateRaceOrder(...)` as the single source of truth for recomputing all races; it already uses DAO saves to trigger realtime and updates only when values differ.

**Future Improvements**
- Targeted shifting: Instead of full recompute, increment `raceOrder` for races at or after the inserted position to reduce write amplification.
- DB constraints: Enforce uniqueness of `(event, valid=1, raceOrder)` or a partial index to guard ordering invariants.
- Observability: Add metrics for number of records changed by recalculation to monitor churn over time.


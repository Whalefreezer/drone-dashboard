# NZO Race Order Change: Clarified Model and Impact

## Confirmed Mental Model

For this event, there are two different concepts both being called "race":

- **Bracket race**: the logical elimination node (`Race 1` to `Race 18` in mains progression).
- **Trackside race record (heat)**: the concrete race instance that actually runs in Trackside.

For NZO mains:

- Each bracket race runs as **3 heats**.
- Trackside represents those heats as **3 separate race records**.
- So `18` bracket races means `54` Trackside race records in total (`18 x 3`).

This is the core source of confusion and should be treated as expected behavior, not an edge case.

## What This Means for Ordering

Because each logical bracket race is split into multiple Trackside records, we need race order defined ahead of time so we can:

- map incoming Trackside records back to the correct bracket node,
- keep progression/predictions aligned with the intended elimination flow,
- avoid mis-assigning pilots when later bracket nodes start appearing.

## Virtual/Predicted Future Races (Current App Behavior)

Your understanding is broadly correct.

The frontend bracket layer can show **predicted future bracket nodes** even when Trackside has not created those race records yet. In that case the app creates view-only predicted entries (for example `predicted-race-<order>`) from bracket topology and completed upstream outcomes.

Important boundaries:

- These are **UI-layer synthetic entries**, not real Trackside races.
- They exist to show expected upcoming assignments/order.
- They rely on bracket definition + anchors + current order context.
- Once real Trackside records appear, those should become the source of truth.

## Practical Implication

Knowing the intended order in advance is important because prediction/scheduling UX depends on it. If operational order changes but mapping assumptions are stale, upcoming/predicted races can look correct structurally but be wrong operationally.

## Open Validation Items

- Confirm that mains really remain fixed at `18` bracket races x `3` heats for this NZO run.
- Confirm whether finals are also fixed-heat or variable-heat in this event setup.
- Validate anchor mapping against live Trackside records before event start so each heat record resolves to the intended bracket race order.

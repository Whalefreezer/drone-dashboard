package scheduler

import (
    "encoding/json"
    "log/slog"
    "time"

    "drone-dashboard/ingest"
    "github.com/pocketbase/dbx"
    "github.com/pocketbase/pocketbase/core"
)

// -------------------- Active Race --------------------

// Race identifiers - using type aliases to prevent ID mixups
type (
	RaceSourceID string // External system race ID (e.g., "race-123")
	RaceDBID     string // PocketBase record ID (e.g., "abc123...")
)

// findCurrentRaceWithOrder returns the current race SOURCE ID and its computed order (1-based)
// using the same logic as findCurrentRace/currentRaceAtom. The order is computed from
// rounds.order ASC, race.raceNumber ASC.
// NOTE: Returns RaceSourceID (for use with ingest_targets.sourceId), NOT RaceDBID!
func (m *Manager) findCurrentRaceWithOrder(eventId string) (RaceSourceID, int) {
	// Uses precomputed races.raceOrder to avoid window functions here.
	query := `
		WITH rs AS (
			SELECT id, sourceId, raceOrder, start, end, valid
			FROM races
			WHERE event = {:eventId}
		),
		active AS (
			SELECT sourceId, raceOrder FROM rs
			WHERE valid = 1
			  AND start IS NOT NULL AND start != '' AND start NOT LIKE '0%'
			  AND (end IS NULL OR end = '' OR end LIKE '0%')
			ORDER BY raceOrder ASC LIMIT 1
		),
		last_completed AS (
			SELECT raceOrder FROM rs
			WHERE valid = 1
			  AND start IS NOT NULL AND start != '' AND start NOT LIKE '0%'
			  AND end IS NOT NULL AND end != '' AND end NOT LIKE '0%'
			ORDER BY raceOrder DESC LIMIT 1
		),
		next_after_completed AS (
			SELECT r.sourceId, r.raceOrder FROM rs r, last_completed lc
			WHERE r.raceOrder = lc.raceOrder + 1
		),
		first_race AS (
			SELECT sourceId, raceOrder FROM rs
			WHERE raceOrder > 0
			ORDER BY raceOrder ASC LIMIT 1
		)
		SELECT
		  COALESCE((SELECT sourceId FROM active), (SELECT sourceId FROM next_after_completed), (SELECT sourceId FROM first_race)) AS current_race_source_id,
		  COALESCE((SELECT raceOrder FROM active), (SELECT raceOrder FROM next_after_completed), (SELECT raceOrder FROM first_race)) AS current_race_order
	`

	var result struct {
		CurrentRaceSourceId string `db:"current_race_source_id"`
		CurrentRaceOrder    int    `db:"current_race_order"`
	}
	if err := m.App.DB().NewQuery(query).Bind(dbx.Params{"eventId": eventId}).One(&result); err != nil {
		slog.Warn("scheduler.findCurrentRaceWithOrder.query.error", "eventId", eventId, "err", err)
		return "", 0
	}
	if result.CurrentRaceSourceId == "" {
		return "", 0
	}
	return RaceSourceID(result.CurrentRaceSourceId), result.CurrentRaceOrder
}

// recalculateRaceOrder updates races.raceOrder for all races in the event.
// Valid races get sequential raceOrder numbers, invalid races get raceOrder set to 0.
// Only processes races where the raceOrder would actually change.
func (m *Manager) recalculateRaceOrder(eventId string) {
    if err := ingest.RecalculateRaceOrder(m.App, eventId); err != nil {
        slog.Warn("scheduler.recalculateRaceOrder.error", "eventId", eventId, "err", err)
    }
}

// publishCurrentOrderKV writes the current order and race id into client_kv for the event.
// Only saves if there are actual changes to avoid unnecessary database writes.
func (m *Manager) publishCurrentOrderKV(eventId, raceId string, order int) {
	if eventId == "" || raceId == "" || order <= 0 {
		return
	}
	// Build JSON value
	payload := map[string]any{
		"order":      order,
		"sourceId":   raceId,
		"computedAt": time.Now().UnixMilli(),
	}
	b, _ := json.Marshal(payload)
	newValue := string(b)

	// find existing kv
	rec, _ := m.App.FindFirstRecordByFilter(
		"client_kv",
		"namespace = {:ns} && key = {:k} && event = {:e}",
		dbx.Params{"ns": "race", "k": "currentOrder", "e": eventId},
	)

	// Check if we need to create a new record or if the value has changed
	if rec == nil {
		col, err := m.App.FindCollectionByNameOrId("client_kv")
		if err != nil {
			return
		}
		rec = core.NewRecord(col)
		rec.Set("namespace", "race")
		rec.Set("key", "currentOrder")
		rec.Set("event", eventId)
		rec.Set("value", newValue)
		_ = m.App.Save(rec)
	} else {
		// Only save if the meaningful values (order and raceId) have actually changed
		existingValue := rec.GetString("value")

		// Parse existing JSON to compare meaningful fields
		var existingPayload map[string]any
		if err := json.Unmarshal([]byte(existingValue), &existingPayload); err == nil {
			// Compare only the meaningful fields, ignore computedAt
			existingOrder, existingOrderOk := existingPayload["order"].(float64)
			existingSourceId, existingSourceIdOk := existingPayload["sourceId"].(string)

			if existingOrderOk && existingSourceIdOk &&
				int(existingOrder) == order && existingSourceId == raceId {
				// Values haven't changed, no need to save
				return
			}
		}

		// Values have changed or we couldn't parse existing JSON, save new value
		rec.Set("value", newValue)
		_ = m.App.Save(rec)
	}
}

func (m *Manager) ensureActiveRacePriority() {
	eventPBID := m.findCurrentEventPBID()
	if eventPBID == "" {
		return
	}

	// Keep raceOrder up to date before publishing/using it
	m.recalculateRaceOrder(eventPBID)

	// Step 1: Find the current race SOURCE ID and order
	// NOTE: This returns RaceSourceID (for ingest_targets.sourceId), not RaceDBID!
	currentRaceSourceId, currentOrder := m.findCurrentRaceWithOrder(eventPBID)
	if currentRaceSourceId == "" {
		return // nothing to promote; discovery will keep idle intervals
	}

	// Step 2: Update all race ingest targets
	// Set current race to active interval, all others to idle interval.
	// SQL query already filters to only return targets that need updating.

	// First, find all ingest targets that need updating
	activeMs := int(m.Cfg.RaceActive.Milliseconds())
	idleMs := int(m.Cfg.RaceIdle.Milliseconds())
	now := time.Now()

	query := `
		SELECT id, sourceId, intervalMs, priority
		FROM ingest_targets
		WHERE type = 'race' AND event = {:eventId}
		  AND (
			  (sourceId = {:currentRaceSourceId} AND (intervalMs != {:activeMs} OR priority != 100))
			  OR
			  (sourceId != {:currentRaceSourceId} AND (intervalMs != {:idleMs} OR priority != 0))
		  )
	`

	type targetResult struct {
		ID         string `db:"id"`
		SourceID   string `db:"sourceId"`
		IntervalMs int    `db:"intervalMs"`
		Priority   int    `db:"priority"`
	}

	var targets []targetResult
	if err := m.App.DB().NewQuery(query).Bind(dbx.Params{
		"eventId":             eventPBID,
		"currentRaceSourceId": string(currentRaceSourceId), // Convert RaceSourceID to string for SQL
		"activeMs":            activeMs,
		"idleMs":              idleMs,
	}).All(&targets); err != nil {
		slog.Warn("scheduler.ensureActiveRacePriority.query.error", "eventId", eventPBID, "currentRaceSourceId", currentRaceSourceId, "err", err)
		return
	}

	// Update each target using DAO to ensure subscriptions trigger
	rowsAffected := 0
	for _, target := range targets {
		record, err := m.App.FindRecordById("ingest_targets", target.ID)
		if err != nil {
			slog.Warn("scheduler.ensureActiveRacePriority.find.error", "targetId", target.ID, "err", err)
			continue
		}

		// Determine new values based on whether this is the current race
		isCurrentRace := target.SourceID == string(currentRaceSourceId)

		var newIntervalMs, newPriority int
		if isCurrentRace {
			newIntervalMs = activeMs
			newPriority = 100
		} else {
			newIntervalMs = idleMs
			newPriority = 0
		}

		// Set the new values (SQL already filtered to only changed records)
		record.Set("intervalMs", newIntervalMs)
		record.Set("priority", newPriority)

		// Update nextDueAt only for the current race
		if isCurrentRace {
			record.Set("nextDueAt", now.UnixMilli())
		}

		if err := m.App.Save(record); err != nil {
			slog.Warn("scheduler.ensureActiveRacePriority.save.error", "targetId", target.ID, "err", err)
		} else {
			rowsAffected++
		}
	}

	// Publish current order for clients if rows changed
	if rowsAffected > 0 {
		m.publishCurrentOrderKV(eventPBID, string(currentRaceSourceId), currentOrder)
	}
}

// RegisterHooks sets up record update hooks to trigger active race priority updates
func (m *Manager) RegisterHooks() {
	// Common handler for collections that reference event
	register := func(col string) {
		m.App.OnRecordAfterUpdateSuccess(col).BindFunc(func(e *core.RecordEvent) error {
			eventId := e.Record.GetString("event")
			if eventId == "" {
				return e.Next()
			}
			if eventId == m.findCurrentEventPBID() {
				m.ensureActiveRacePriority()
			}
			return e.Next()
		})
	}
	for _, col := range []string{"races", "rounds"} {
		register(col)
	}
	// Also react on events updates (e.g., isCurrent flips)
	m.App.OnRecordAfterUpdateSuccess("events").BindFunc(func(e *core.RecordEvent) error {
		// Any change might affect current event selection; recompute
		m.ensureActiveRacePriority()
		return e.Next()
	})
}

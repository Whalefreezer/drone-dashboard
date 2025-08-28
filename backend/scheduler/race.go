package scheduler

import (
	"encoding/json"
	"log/slog"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// -------------------- Active Race --------------------

// findCurrentRaceWithOrder returns the current race id and its computed order (1-based)
// using the same logic as findCurrentRace/currentRaceAtom. The order is computed from
// rounds.order ASC, race.raceNumber ASC.
func (m *Manager) findCurrentRaceWithOrder(eventId string) (string, int) {
	// Uses precomputed races.raceOrder to avoid window functions here.
	query := `
		WITH rs AS (
			SELECT id, raceOrder, start, end, valid
			FROM races
			WHERE event = {:eventId}
		),
		active AS (
			SELECT id, raceOrder FROM rs
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
			SELECT r.id, r.raceOrder FROM rs r, last_completed lc
			WHERE r.raceOrder = lc.raceOrder + 1
		),
		first_race AS (
			SELECT id, raceOrder FROM rs ORDER BY raceOrder ASC LIMIT 1
		)
		SELECT
		  COALESCE((SELECT id FROM active), (SELECT id FROM next_after_completed), (SELECT id FROM first_race)) AS current_race_id,
		  COALESCE((SELECT raceOrder FROM active), (SELECT raceOrder FROM next_after_completed), (SELECT raceOrder FROM first_race)) AS current_race_order
	`

	var result struct {
		CurrentRaceId    string `db:"current_race_id"`
		CurrentRaceOrder int    `db:"current_race_order"`
	}
	if err := m.App.DB().NewQuery(query).Bind(dbx.Params{"eventId": eventId}).One(&result); err != nil {
		slog.Warn("scheduler.findCurrentRaceWithOrder.query.error", "eventId", eventId, "err", err)
		return "", 0
	}
	if result.CurrentRaceId == "" {
		return "", 0
	}
	return result.CurrentRaceId, result.CurrentRaceOrder
}

// recalculateRaceOrder updates races.raceOrder for all races in the event using a single SQL statement.
func (m *Manager) recalculateRaceOrder(eventId string) {
	query := `
		WITH ordered AS (
			SELECT r.id, ROW_NUMBER() OVER (
				ORDER BY round."order" ASC, r.raceNumber ASC
			) AS pos
			FROM races r
			LEFT JOIN rounds round ON r.round = round.id
			WHERE r.event = {:eventId}
		)
		UPDATE races
		SET raceOrder = (
			SELECT pos FROM ordered WHERE ordered.id = races.id
		)
		WHERE event = {:eventId}
	`
	if _, err := m.App.DB().NewQuery(query).Bind(dbx.Params{"eventId": eventId}).Execute(); err != nil {
		slog.Warn("scheduler.recalculateRaceOrder.update.error", "eventId", eventId, "err", err)
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
		"raceId":     raceId,
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
		// Only save if the value has actually changed
		existingValue := rec.GetString("value")
		if existingValue != newValue {
			rec.Set("value", newValue)
			_ = m.App.Save(rec)
		}
	}
}

func (m *Manager) ensureActiveRacePriority() {
	eventPBID := m.findCurrentEventPBID()
	if eventPBID == "" {
		return
	}

	// Keep raceOrder up to date before publishing/using it
	m.recalculateRaceOrder(eventPBID)

	// Step 1: Find the current race and order
	currentRaceId, currentOrder := m.findCurrentRaceWithOrder(eventPBID)
	if currentRaceId == "" {
		return // nothing to promote; discovery will keep idle intervals
	}

	// Step 2: Update all race ingest targets
	// Set current race to active interval, all others to idle interval.
	// Only update rows that actually need changing to avoid unnecessary writes.
	query := `
		UPDATE ingest_targets
		SET
			intervalMs = CASE
				WHEN sourceId = {:currentRaceId}
				THEN {:activeMs}
				ELSE {:idleMs}
			END,
			priority = CASE
				WHEN sourceId = {:currentRaceId}
				THEN 100
				ELSE 0
			END,
			nextDueAt = CASE
				WHEN sourceId = {:currentRaceId} AND (intervalMs != {:activeMs} OR priority != 100)
				THEN {:nowMs}
				ELSE nextDueAt
			END
		WHERE type = 'race' AND event = {:eventId}
		  AND (
			  (sourceId = {:currentRaceId} AND (intervalMs != {:activeMs} OR priority != 100))
			  OR
			  (sourceId != {:currentRaceId} AND (intervalMs != {:idleMs} OR priority != 0))
		  )
	`

	now := time.Now()
	res, err := m.App.DB().NewQuery(query).Bind(dbx.Params{
		"eventId":       eventPBID,
		"currentRaceId": currentRaceId,
		"activeMs":      int(m.Cfg.RaceActive.Milliseconds()),
		"idleMs":        int(m.Cfg.RaceIdle.Milliseconds()),
		"nowMs":         now.UnixMilli(),
	}).Execute()

	if err != nil {
		slog.Warn("scheduler.ensureActiveRacePriority.update.error", "eventId", eventPBID, "currentRaceId", currentRaceId, "err", err)
		return
	}
	// Publish current order for clients if rows changed
	if res != nil {
		if n, _ := res.RowsAffected(); n > 0 {
			m.publishCurrentOrderKV(eventPBID, currentRaceId, currentOrder)
		}
	}
}

// RegisterHooks sets up record update hooks to trigger active race priority updates
func (m *Manager) RegisterHooks() {
	// Common handler for collections that reference event
	register := func(col string) {
		m.App.OnRecordAfterUpdateSuccess(col).BindFunc(func(e *core.RecordEvent) error {
			eventId := e.Record.GetString("event")
			if eventId == "" {
				return nil
			}
			if eventId == m.findCurrentEventPBID() {
				m.ensureActiveRacePriority()
			}
			return nil
		})
	}
	for _, col := range []string{"races", "rounds"} {
		register(col)
	}
	// Also react on events updates (e.g., isCurrent flips)
	m.App.OnRecordAfterUpdateSuccess("events").BindFunc(func(e *core.RecordEvent) error {
		// Any change might affect current event selection; recompute
		m.ensureActiveRacePriority()
		return nil
	})
}

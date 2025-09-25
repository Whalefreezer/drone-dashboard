package scheduler

import (
	"log/slog"
	"time"

	"drone-dashboard/ingest"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// -------------------- Discovery --------------------

func (m *Manager) runDiscovery() {
	// Always fetch from external system rather than preferring existing current event.
	// This ensures we work with the live event data and avoids stale references.
	// The previous logic tried to prefer existing current events but created
	// race conditions where targets were created before events existed in DB.

	now := time.Now()
	cfg := m.currentConfig()

	// 1. Get event source ID from external system
	eventSourceId, err := m.Service.Source.FetchEventSourceId()
	if err != nil {
		slog.Warn("scheduler.discovery.fetchEventSourceId.error", "err", err)
		return
	}

	// 2. Fetch event data to validate it exists and get race information
	events, err := m.Service.Source.FetchEvent(eventSourceId)
	if err != nil || len(events) == 0 {
		slog.Warn("scheduler.discovery.fetchEvent.error", "eventSourceId", eventSourceId, "err", err)
		return
	}
	eventData := events[0]

	// 3. Ingest event metadata FIRST to ensure it exists in database
	// Use the already-fetched event data to avoid duplicate API call
	if err := m.Service.IngestEventMetaFromData(eventData); err != nil {
		slog.Warn("scheduler.discovery.ingestEventMeta.error", "eventSourceId", eventSourceId, "err", err)
		return
	}

	// 4. Now get the PocketBase event ID (guaranteed to exist after ingestion)
	eventPBID, err := m.Service.Upserter.GetExistingId("events", eventSourceId)
	if err != nil {
		slog.Warn("scheduler.discovery.getExistingId.error", "eventSourceId", eventSourceId, "err", err)
		return
	}

	// 5. Prune any ingest targets that belong to other events to avoid stale ingestion
	m.pruneTargetsNotForEvent(eventPBID)

	// 6. Create targets with proper PocketBase ID for relations

	// Seed event-related targets (per-endpoint granularity)
	m.upsertTarget("event", eventSourceId, eventPBID, cfg.FullInterval, now)
	m.upsertTarget("pilots", eventSourceId, eventPBID, cfg.FullInterval, now)
	m.upsertTarget("channels", eventSourceId, eventPBID, cfg.ChannelsInterval, now)
	m.upsertTarget("rounds", eventSourceId, eventPBID, cfg.FullInterval, now, 1)
	m.upsertTarget("results", eventSourceId, eventPBID, cfg.ResultsInterval, now)

	// Seed one race target per race ID from the fetched event data
	for _, raceID := range eventData.Races {
		m.upsertTarget("race", string(raceID), eventPBID, cfg.RaceIdle, now)
	}

	// Optionally: prune orphaned targets for this event
	m.pruneOrphans(eventPBID, eventData.Races)

	slog.Debug("scheduler.discovery.completed", "eventSourceId", eventSourceId, "eventPBID", eventPBID, "races", len(eventData.Races))

	// After reconciling targets/races, ensure active race priority and publish current order
	m.ensureActiveRacePriority()

	// Lastly, ensure only this event is marked as current (flip others only if needed)
	if err := m.Service.SetEventAsCurrent(eventSourceId); err != nil {
		slog.Warn("scheduler.discovery.setEventAsCurrent.error", "eventSourceId", eventSourceId, "err", err)
	}
}

// pruneTargetsNotForEvent deletes all ingest_targets that do not belong to the provided eventPBID.
// This ensures the scheduler does not keep ingesting data for a previous event.
func (m *Manager) pruneTargetsNotForEvent(currentEventPBID string) {
	if currentEventPBID == "" {
		return
	}
	// Select targets whose event is null/empty or different than the current event
	query := `
        SELECT id FROM ingest_targets
        WHERE event IS NULL OR event = '' OR event != {:e}
    `
	type row struct {
		ID string `db:"id"`
	}
	var rows []row
	if err := m.App.DB().NewQuery(query).Bind(dbx.Params{"e": currentEventPBID}).All(&rows); err != nil {
		slog.Warn("scheduler.pruneTargetsNotForEvent.query.error", "eventPBID", currentEventPBID, "err", err)
		return
	}
	removed := 0
	for _, r := range rows {
		rec, err := m.App.FindRecordById("ingest_targets", r.ID)
		if err != nil || rec == nil {
			slog.Debug("scheduler.pruneTargetsNotForEvent.find.error", "id", r.ID, "err", err)
			continue
		}
		if err := m.App.Delete(rec); err != nil {
			slog.Warn("scheduler.pruneTargetsNotForEvent.delete.error", "id", r.ID, "err", err)
			continue
		}
		removed++
	}
	if removed > 0 {
		slog.Info("scheduler.pruneTargetsNotForEvent.done", "eventPBID", currentEventPBID, "removed", removed)
	}
}

func (m *Manager) upsertTarget(t string, sourceId string, eventPBID string, interval time.Duration, now time.Time, priority ...int) {
	colName := "ingest_targets"
	rec, _ := m.App.FindFirstRecordByFilter(colName, "type = {:t} && sourceId = {:sid}", dbx.Params{"t": t, "sid": sourceId})

	// Treat non-positive interval as disabled: remove existing target if present and exit.
	if interval <= 0 {
		if rec != nil {
			_ = m.App.Delete(rec)
		}
		return
	}
	intervalMs := int(interval.Milliseconds())

	isNewRecord := rec == nil
	if isNewRecord {
		col, err := m.App.FindCollectionByNameOrId(colName)
		if err != nil {
			slog.Warn("scheduler.upsertTarget.collection.error", "err", err)
			return
		}
		rec = core.NewRecord(col)
		rec.Set("type", t)
		rec.Set("sourceId", sourceId)
		rec.Set("intervalMs", intervalMs)
		rec.Set("enabled", true)
		// Use passed priority or default to 0
		priorityValue := 0
		if len(priority) > 0 {
			priorityValue = priority[0]
		}
		rec.Set("priority", priorityValue)
		rec.Set("nextDueAt", now.UnixMilli())
	} else {
		recordedInterval := rec.GetInt("intervalMs")
		if recordedInterval != intervalMs {
			rec.Set("intervalMs", intervalMs)
			rec.Set("nextDueAt", now.UnixMilli())
		}
		if !rec.GetBool("enabled") {
			rec.Set("enabled", true)
		}
		if len(priority) > 0 {
			rec.Set("priority", priority[0])
		}
	}
	if eventPBID != "" {
		rec.Set("event", eventPBID)
	}

	if err := m.App.Save(rec); err != nil {
		slog.Warn("scheduler.upsertTarget.save.error", "type", t, "sourceId", sourceId, "err", err)
	}
}

func (m *Manager) pruneOrphans(eventPBID string, validRaceIds []ingest.Guid) {
	// Build set of valid races
	valid := map[string]struct{}{}
	for _, r := range validRaceIds {
		valid[string(r)] = struct{}{}
	}
	all, err := m.App.FindAllRecords("ingest_targets")
	if err != nil {
		slog.Warn("scheduler.pruneOrphans.list.error", "eventPBID", eventPBID, "err", err)
		return
	}
	for _, r := range all {
		if eventPBID == "" {
			continue
		}
		if r.GetString("event") != eventPBID {
			continue
		}
		t := r.GetString("type")
		sid := r.GetString("sourceId")
		if t == "race" {
			if _, ok := valid[sid]; !ok {
				// delete orphan race target
				if err := m.App.Delete(r); err != nil {
					slog.Warn("scheduler.pruneOrphans.delete.error", "id", r.Id, "err", err)
				}
			}
		}
	}
}

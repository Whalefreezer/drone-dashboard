package scheduler

import (
	"hash/fnv"
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

	// 1. Get event source ID from external system
	eventSourceId, err := m.Service.Client.FetchEventSourceId()
	if err != nil {
		slog.Warn("scheduler.discovery.fetchEventSourceId.error", "err", err)
		return
	}

	// 2. Fetch event data to validate it exists and get race information
	events, err := m.Service.Client.FetchEvent(eventSourceId)
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

	// 5. Create targets with proper PocketBase ID for relations
	now := time.Now()

	// Seed event-related targets (per-endpoint granularity)
	m.upsertTarget("event", eventSourceId, eventPBID, m.Cfg.FullInterval, now)
	m.upsertTarget("pilots", eventSourceId, eventPBID, m.Cfg.FullInterval, now)
	m.upsertTarget("channels", eventSourceId, eventPBID, m.Cfg.ChannelsInterval, now)
	m.upsertTarget("rounds", eventSourceId, eventPBID, m.Cfg.FullInterval, now)
	// Seed results target
	m.upsertTarget("results", eventSourceId, eventPBID, m.Cfg.ResultsInterval, now)

	// Seed one race target per race ID from the fetched event data
	for _, raceID := range eventData.Races {
		m.upsertTarget("race", string(raceID), eventPBID, m.Cfg.RaceIdle, now)
	}

	// Optionally: prune orphaned targets for this event
	m.pruneOrphans(eventPBID, eventData.Races)

	slog.Info("scheduler.discovery.completed", "eventSourceId", eventSourceId, "eventPBID", eventPBID, "races", len(eventData.Races))

	// After reconciling targets/races, ensure active race priority and publish current order
	m.ensureActiveRacePriority()
}

func (m *Manager) upsertTarget(t string, sourceId string, eventPBID string, interval time.Duration, now time.Time) {
	colName := "ingest_targets"
	rec, _ := m.App.FindFirstRecordByFilter(colName, "type = {:t} && sourceId = {:sid}", dbx.Params{"t": t, "sid": sourceId})
	// Compute staggered nextDueAt if missing
	nextDueMs := int64(0)
	if rec != nil {
		nextDueMs = int64(rec.GetInt("nextDueAt"))
	}
	if nextDueMs == 0 {
		phase := time.Duration(hash32(sourceId)) % interval
		nextDueMs = now.Add(phase).UnixMilli()
	}

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
		rec.Set("intervalMs", int(interval.Milliseconds()))
		rec.Set("enabled", true)
		rec.Set("priority", 0) // default priority for new records
	}
	if eventPBID != "" {
		rec.Set("event", eventPBID)
	}
	// Only update nextDueAt for existing records to avoid overriding ensureActiveRacePriority settings
	rec.Set("nextDueAt", nextDueMs)
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
				_ = m.App.Delete(r)
			}
		}
	}
}

func hash32(s string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return h.Sum32()
}

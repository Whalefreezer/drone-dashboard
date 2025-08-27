package scheduler

import (
	"context"
	"fmt"
	"hash/fnv"
	"log/slog"
	"math/rand"
	"sort"
	"strings"
	"time"

	"drone-dashboard/ingest"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type Config struct {
	FullInterval    time.Duration
	WorkerInterval  time.Duration
	ActiveCheck     time.Duration
	RaceActive      time.Duration
	RaceIdle        time.Duration
	ResultsInterval time.Duration
	Concurrency     int
	Burst           int
	JitterMs        int
}

type Manager struct {
	App     core.App
	Service *ingest.Service
	Cfg     Config
}

func NewManager(app core.App, service *ingest.Service, cfg Config) *Manager {
	return &Manager{App: app, Service: service, Cfg: cfg}
}

// StartLoops spawns the discovery, worker, and active race goroutines.
func (m *Manager) StartLoops(ctx context.Context) {
	// seed defaults if missing
	m.ensureDefaultSettings()
	// load settings-derived config
	m.loadConfigFromDB()
	// Discovery loop
	go func() {
		ticker := time.NewTicker(m.Cfg.FullInterval)
		defer ticker.Stop()
		for {
			if m.isEnabled() {
				m.runDiscovery()
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()

	// Worker loop
	go func() {
		ticker := time.NewTicker(m.Cfg.WorkerInterval)
		defer ticker.Stop()
		for {
			if m.isEnabled() {
				m.drainOnce()
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()

	// Active race loop
	go func() {
		ticker := time.NewTicker(m.Cfg.ActiveCheck)
		defer ticker.Stop()
		for {
			if m.isEnabled() {
				m.ensureActiveRacePriority()
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

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
	m.upsertTarget("channels", eventSourceId, eventPBID, m.Cfg.FullInterval, now)
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

	if rec == nil {
		col, err := m.App.FindCollectionByNameOrId(colName)
		if err != nil {
			slog.Warn("scheduler.upsertTarget.collection.error", "err", err)
			return
		}
		rec = core.NewRecord(col)
		rec.Set("type", t)
		rec.Set("sourceId", sourceId)
	}
	if eventPBID != "" {
		rec.Set("event", eventPBID)
	}
	rec.Set("intervalMs", int(interval.Milliseconds()))
	rec.Set("enabled", true)
	rec.Set("priority", rec.GetInt("priority")) // keep existing priority if any
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

// -------------------- Worker --------------------

func (m *Manager) drainOnce() {
	all, err := m.App.FindAllRecords("ingest_targets")
	if err != nil {
		return
	}
	nowMs := time.Now().UnixMilli()
	// Filter due & enabled
	type item struct {
		rec  *core.Record
		next int
		prio int
	}
	var due []item
	for _, r := range all {
		if !r.GetBool("enabled") {
			continue
		}
		nd := int64(r.GetInt("nextDueAt"))
		if nd <= nowMs {
			due = append(due, item{rec: r, next: int(nd), prio: r.GetInt("priority")})
		}
	}
	sort.Slice(due, func(i, j int) bool {
		if due[i].next == due[j].next {
			return due[i].prio > due[j].prio
		}
		return due[i].next < due[j].next
	})
	// Take up to burst
	if len(due) > m.Cfg.Burst {
		due = due[:m.Cfg.Burst]
	}
	for _, it := range due {
		r := it.rec
		t := r.GetString("type")
		sid := r.GetString("sourceId")
		// Resolve event sourceId from relation
		eventSourceId := m.resolveEventSourceIdFromTarget(r)
		var err error
		switch t {
		case "event":
			err = m.Service.IngestEventMeta(eventSourceId)
		case "pilots":
			err = m.Service.IngestPilots(eventSourceId)
		case "channels":
			err = m.Service.IngestChannels(eventSourceId)
		case "rounds":
			err = m.Service.IngestRounds(eventSourceId)
		case "race":
			err = m.Service.IngestRace(eventSourceId, sid)
		case "results":
			_, err = m.Service.IngestResults(eventSourceId)
		default:
			slog.Warn("scheduler.worker.unknownType", "type", t)
		}
		m.reschedule(r, err)
	}
}

func (m *Manager) reschedule(rec *core.Record, runErr error) {
	now := time.Now()
	interval := time.Duration(rec.GetInt("intervalMs")) * time.Millisecond
	if interval <= 0 {
		interval = m.Cfg.RaceIdle
	}
	// backoff on error
	if runErr != nil {
		rec.Set("lastStatus", fmt.Sprintf("error: %v", runErr))
		// simple capped backoff: +1s up to interval*4
		backoff := time.Second
		if bo := 4 * interval; backoff > bo {
			backoff = bo
		}
		rec.Set("nextDueAt", now.Add(backoff).UnixMilli())
	} else {
		rec.Set("lastStatus", "ok")
		rec.Set("lastFetchedAt", now.UnixMilli())
		jitter := time.Duration(rand.Intn(max(0, m.Cfg.JitterMs))) * time.Millisecond
		rec.Set("nextDueAt", now.Add(interval).Add(jitter).UnixMilli())
	}
	if err := m.App.Save(rec); err != nil {
		slog.Warn("scheduler.reschedule.save.error", "err", err)
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// -------------------- Active Race --------------------

func (m *Manager) ensureActiveRacePriority() {
	eventPBID := m.findCurrentEventPBID()
	if eventPBID == "" {
		return
	}

	// Load races for event
	races, err := m.App.FindAllRecords("races")
	if err != nil {
		return
	}

	// Determine active race per frontend logic
	activeRaceId := ""
	// first find active (valid && started && not ended)
	for _, r := range races {
		if r.GetString("event") != eventPBID {
			continue
		}
		if !r.GetBool("valid") {
			continue
		}
		start := r.GetString("start")
		end := r.GetString("end")
		if start != "" && !strings.HasPrefix(start, "0") && (end == "" || strings.HasPrefix(end, "0")) {
			activeRaceId = r.Id
			break
		}
	}
	if activeRaceId == "" {
		return // nothing to promote; discovery will keep idle intervals
	}

	// Promote active race target to fast interval and higher priority
	rec, _ := m.App.FindFirstRecordByFilter("ingest_targets", "type = 'race' && sourceId = {:sid}", dbx.Params{"sid": activeRaceId})
	if rec == nil {
		// create target if missing
		col, err := m.App.FindCollectionByNameOrId("ingest_targets")
		if err != nil {
			return
		}
		rec = core.NewRecord(col)
		rec.Set("type", "race")
		rec.Set("sourceId", activeRaceId)
		rec.Set("event", eventPBID)
	}
	rec.Set("intervalMs", int(m.Cfg.RaceActive.Milliseconds()))
	rec.Set("priority", max(rec.GetInt("priority"), 100))
	rec.Set("enabled", true)
	rec.Set("nextDueAt", time.Now().UnixMilli())
	_ = m.App.Save(rec)
}

// -------------------- Helpers --------------------

func (m *Manager) findCurrentEventPBID() string {
	rec, err := m.App.FindFirstRecordByFilter("events", "isCurrent = true", nil)
	if err == nil && rec != nil {
		return rec.Id
	}
	return ""
}

func (m *Manager) resolveEventSourceIdFromTarget(rec *core.Record) string {
	pbid := rec.GetString("event")
	if pbid == "" {
		return ""
	}
	col, err := m.App.FindCollectionByNameOrId("events")
	if err != nil {
		return ""
	}
	ev, err := m.App.FindRecordById(col, pbid)
	if err != nil || ev == nil {
		return ""
	}
	return ev.GetString("sourceId")
}

func hash32(s string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return h.Sum32()
}

// isEnabled checks server_settings key `scheduler.enabled` (default true).
func (m *Manager) isEnabled() bool {
	rec, err := m.App.FindFirstRecordByFilter("server_settings", "key = 'scheduler.enabled'", nil)
	if err != nil || rec == nil {
		return true
	}
	val := strings.ToLower(strings.TrimSpace(rec.GetString("value")))
	return !(val == "false" || val == "0" || val == "off")
}

func (m *Manager) ensureDefaultSettings() {
	defaults := map[string]string{
		"scheduler.enabled":          "true",
		"scheduler.fullIntervalMs":   "10000",
		"scheduler.workerIntervalMs": "200",
		"scheduler.activeCheckMs":    "1000",
		"scheduler.raceActiveMs":     "200",
		"scheduler.raceIdleMs":       "5000",
		"scheduler.resultsMs":        "2000",
		"scheduler.jitterMs":         "150",
		"scheduler.burst":            "2",
		"scheduler.concurrency":      "1",
	}
	col, err := m.App.FindCollectionByNameOrId("server_settings")
	if err != nil {
		return
	}
	for k, v := range defaults {
		rec, _ := m.App.FindFirstRecordByFilter("server_settings", "key = {:k}", dbx.Params{"k": k})
		if rec == nil {
			rec = core.NewRecord(col)
			rec.Set("key", k)
			rec.Set("value", v)
			_ = m.App.Save(rec)
		}
	}
}

func (m *Manager) loadConfigFromDB() {
	// helper to read int setting with default
	readInt := func(key string, def int) int {
		rec, err := m.App.FindFirstRecordByFilter("server_settings", "key = {:k}", dbx.Params{"k": key})
		if err != nil || rec == nil {
			return def
		}
		var n int
		if _, err := fmt.Sscanf(rec.GetString("value"), "%d", &n); err == nil {
			return n
		}
		return def
	}
	m.Cfg.FullInterval = time.Duration(readInt("scheduler.fullIntervalMs", 10000)) * time.Millisecond
	m.Cfg.WorkerInterval = time.Duration(readInt("scheduler.workerIntervalMs", 200)) * time.Millisecond
	m.Cfg.ActiveCheck = time.Duration(readInt("scheduler.activeCheckMs", 1000)) * time.Millisecond
	m.Cfg.RaceActive = time.Duration(readInt("scheduler.raceActiveMs", 200)) * time.Millisecond
	m.Cfg.RaceIdle = time.Duration(readInt("scheduler.raceIdleMs", 5000)) * time.Millisecond
	m.Cfg.ResultsInterval = time.Duration(readInt("scheduler.resultsMs", 2000)) * time.Millisecond
	m.Cfg.Burst = readInt("scheduler.burst", 2)
	m.Cfg.Concurrency = readInt("scheduler.concurrency", 1)
	m.Cfg.JitterMs = readInt("scheduler.jitterMs", 150)
}

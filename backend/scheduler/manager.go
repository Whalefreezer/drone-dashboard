package scheduler

import (
    "context"
    "encoding/json"
    "fmt"
    "hash/fnv"
    "log/slog"
    "math/rand"
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
    // initial promotion of active race / order publish
    if m.isEnabled() {
        m.ensureActiveRacePriority()
    }
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
    nowMs := time.Now().UnixMilli()
    // Query only due & enabled targets ordered by nextDueAt, priority
    type dueRow struct {
        ID         string `db:"id"`
        Type       string `db:"type"`
        SourceID   string `db:"sourceId"`
        Event      string `db:"event"`
        IntervalMs int    `db:"intervalMs"`
        Priority   int    `db:"priority"`
    }
    var rows []dueRow
    q := `SELECT id, type, sourceId, event, intervalMs, priority
          FROM ingest_targets
          WHERE enabled = 1 AND nextDueAt <= {:now}
          ORDER BY nextDueAt ASC, priority DESC
          LIMIT {:lim}`
    if err := m.App.DB().NewQuery(q).Bind(dbx.Params{"now": nowMs, "lim": m.Cfg.Burst}).All(&rows); err != nil {
        return
    }
    if len(rows) == 0 {
        return
    }
    for _, rw := range rows {
        t := rw.Type
        sid := rw.SourceID
        // Resolve event sourceId from event relation id
        eventSourceId := m.resolveEventSourceIdByPBID(rw.Event)
        var runErr error
        switch t {
        case "event":
            runErr = m.Service.IngestEventMeta(eventSourceId)
        case "pilots":
            runErr = m.Service.IngestPilots(eventSourceId)
        case "channels":
            runErr = m.Service.IngestChannels(eventSourceId)
        case "rounds":
            runErr = m.Service.IngestRounds(eventSourceId)
        case "race":
            runErr = m.Service.IngestRace(eventSourceId, sid)
        case "results":
            _, runErr = m.Service.IngestResults(eventSourceId)
        default:
            slog.Warn("scheduler.worker.unknownType", "type", t)
        }
        m.rescheduleRow(rw.ID, rw.IntervalMs, runErr)
    }
}

func (m *Manager) reschedule(rec *core.Record, runErr error) {
	now := time.Now()
	interval := time.Duration(rec.GetInt("intervalMs")) * time.Millisecond
	if interval <= 0 {
		interval = m.Cfg.RaceIdle
	}
	// compute nextDueAt via helper and set status
	hadError := runErr != nil
	if hadError {
		rec.Set("lastStatus", fmt.Sprintf("error: %v", runErr))
	} else {
		rec.Set("lastStatus", "ok")
		rec.Set("lastFetchedAt", now.UnixMilli())
	}
	rec.Set("nextDueAt", m.nextDueAt(now, interval, hadError))
    if err := m.App.Save(rec); err != nil {
        slog.Warn("scheduler.reschedule.save.error", "err", err)
    }
}

// rescheduleRow updates scheduling fields using the already selected row (no extra read).
func (m *Manager) rescheduleRow(id string, intervalMs int, runErr error) {
    now := time.Now()
    interval := time.Duration(intervalMs) * time.Millisecond
    if interval <= 0 {
        interval = m.Cfg.RaceIdle
    }
    hadError := runErr != nil
    if hadError {
        _, _ = m.App.DB().NewQuery(`UPDATE ingest_targets
            SET lastStatus = {:st}, nextDueAt = {:nd}
            WHERE id = {:id}
        `).Bind(dbx.Params{
            "st": fmt.Sprintf("error: %v", runErr),
            "nd": m.nextDueAt(now, interval, true),
            "id": id,
        }).Execute()
        return
    }
    // success path
    _, _ = m.App.DB().NewQuery(`UPDATE ingest_targets
        SET lastStatus = 'ok', lastFetchedAt = {:lf}, nextDueAt = {:nd}
        WHERE id = {:id}
    `).Bind(dbx.Params{
        "lf": now.UnixMilli(),
        "nd": m.nextDueAt(now, interval, false),
        "id": id,
    }).Execute()
}

// nextDueAt computes the next due time given interval, jitter, and error state.
// On success: now + interval + jitter (jitter <= min(Cfg.JitterMs, interval/10)).
// On error: now + min(1s, 4*interval).
func (m *Manager) nextDueAt(now time.Time, interval time.Duration, hadError bool) int64 {
    if hadError {
        backoff := time.Second
        if bo := 4 * interval; backoff > bo {
            backoff = bo
        }
        return now.Add(backoff).UnixMilli()
    }
    intervalMs := int(interval / time.Millisecond)
    jitterCapMs := m.Cfg.JitterMs
    if cap2 := intervalMs / 10; cap2 < jitterCapMs {
        jitterCapMs = cap2
    }
    if jitterCapMs < 0 {
        jitterCapMs = 0
    }
    jitter := 0
    if jitterCapMs > 0 {
        jitter = rand.Intn(jitterCapMs)
    }
    return now.Add(interval).Add(time.Duration(jitter) * time.Millisecond).UnixMilli()
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

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

    // find existing kv
    rec, _ := m.App.FindFirstRecordByFilter(
        "client_kv",
        "namespace = {:ns} && key = {:k} && event = {:e}",
        dbx.Params{"ns": "race", "k": "currentOrder", "e": eventId},
    )
    if rec == nil {
        col, err := m.App.FindCollectionByNameOrId("client_kv")
        if err != nil {
            return
        }
        rec = core.NewRecord(col)
        rec.Set("namespace", "race")
        rec.Set("key", "currentOrder")
        rec.Set("event", eventId)
    }
    rec.Set("value", string(b))
    _ = m.App.Save(rec)
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

// -------------------- Helpers --------------------

func (m *Manager) findCurrentEventPBID() string {
	rec, err := m.App.FindFirstRecordByFilter("events", "isCurrent = true", nil)
	if err == nil && rec != nil {
		return rec.Id
	}
	return ""
}

// resolveEventSourceIdByPBID resolves the upstream sourceId from an event PB id.
func (m *Manager) resolveEventSourceIdByPBID(pbid string) string {
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

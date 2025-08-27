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
            if m.isEnabled() { m.runDiscovery() }
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
            if m.isEnabled() { m.drainOnce() }
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
            if m.isEnabled() { m.ensureActiveRacePriority() }
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
    // Determine current event id; prefer PB current event if present
    eventId := m.findCurrentEventId()
    if eventId == "" {
        id, err := m.Service.Client.FetchEventId()
        if err != nil {
            slog.Warn("scheduler.discovery.fetchEventId.error", "err", err)
            return
        }
        eventId = id
    }

    // Fetch event to list races
    events, err := m.Service.Client.FetchEvent(eventId)
    if err != nil || len(events) == 0 {
        slog.Warn("scheduler.discovery.fetchEvent.error", "eventId", eventId, "err", err)
        return
    }
    e := events[0]

    now := time.Now()

    // Seed event-related targets (per-endpoint granularity)
    m.upsertTarget("event", eventId, eventId, m.Cfg.FullInterval, now)
    m.upsertTarget("pilots", eventId, eventId, m.Cfg.FullInterval, now)
    m.upsertTarget("channels", eventId, eventId, m.Cfg.FullInterval, now)
    m.upsertTarget("rounds", eventId, eventId, m.Cfg.FullInterval, now)
    // Seed results target
    m.upsertTarget("results", eventId, eventId, m.Cfg.ResultsInterval, now)
    // Seed one race target per race id
    for _, rid := range e.Races {
        m.upsertTarget("race", string(rid), eventId, m.Cfg.RaceIdle, now)
    }

    // Optionally: prune orphaned targets for this eventId
    m.pruneOrphans(eventId, e.Races)
}

func (m *Manager) upsertTarget(t string, sourceId string, eventId string, interval time.Duration, now time.Time) {
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
    rec.Set("eventId", eventId)
    rec.Set("intervalMs", int(interval.Milliseconds()))
    rec.Set("enabled", true)
    rec.Set("priority", rec.GetInt("priority")) // keep existing priority if any
    rec.Set("nextDueAt", nextDueMs)
    if err := m.App.Save(rec); err != nil {
        slog.Warn("scheduler.upsertTarget.save.error", "type", t, "sourceId", sourceId, "err", err)
    }
}

func (m *Manager) pruneOrphans(eventId string, validRaceIds []ingest.Guid) {
    // Build set of valid races
    valid := map[string]struct{}{}
    for _, r := range validRaceIds { valid[string(r)] = struct{}{} }
    all, err := m.App.FindAllRecords("ingest_targets")
    if err != nil { return }
    for _, r := range all {
        if r.GetString("eventId") != eventId { continue }
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
    if err != nil { return }
    nowMs := time.Now().UnixMilli()
    // Filter due & enabled
    type item struct{ rec *core.Record; next int; prio int }
    var due []item
    for _, r := range all {
        if !r.GetBool("enabled") { continue }
        nd := int64(r.GetInt("nextDueAt"))
        if nd <= nowMs {
            due = append(due, item{rec: r, next: int(nd), prio: r.GetInt("priority")})
        }
    }
    sort.Slice(due, func(i, j int) bool {
        if due[i].next == due[j].next { return due[i].prio > due[j].prio }
        return due[i].next < due[j].next
    })
    // Take up to burst
    if len(due) > m.Cfg.Burst { due = due[:m.Cfg.Burst] }
    for _, it := range due {
        r := it.rec
        t := r.GetString("type")
        sid := r.GetString("sourceId")
        eventId := r.GetString("eventId")
        var err error
        switch t {
        case "event":
            err = m.Service.IngestEventMeta(eventId)
        case "pilots":
            err = m.Service.IngestPilots(eventId)
        case "channels":
            err = m.Service.IngestChannels(eventId)
        case "rounds":
            err = m.Service.IngestRounds(eventId)
        case "race":
            err = m.Service.IngestRace(eventId, sid)
        case "results":
            _, err = m.Service.IngestResults(eventId)
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
        if bo := 4 * interval; backoff > bo { backoff = bo }
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

func max(a, b int) int { if a > b { return a } ; return b }

// -------------------- Active Race --------------------

func (m *Manager) ensureActiveRacePriority() {
    eventId := m.findCurrentEventId()
    if eventId == "" { return }

    // Load races for event
    races, err := m.App.FindAllRecords("races")
    if err != nil { return }

    // Determine active race per frontend logic
    activeRaceId := ""
    // first find active (valid && started && not ended)
    for _, r := range races {
        if r.GetString("event") != eventId { continue }
        if !r.GetBool("valid") { continue }
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
        if err != nil { return }
        rec = core.NewRecord(col)
        rec.Set("type", "race")
        rec.Set("sourceId", activeRaceId)
        rec.Set("eventId", eventId)
    }
    rec.Set("intervalMs", int(m.Cfg.RaceActive.Milliseconds()))
    rec.Set("priority", max(rec.GetInt("priority"), 100))
    rec.Set("enabled", true)
    rec.Set("nextDueAt", time.Now().UnixMilli())
    _ = m.App.Save(rec)
}

// -------------------- Helpers --------------------

func (m *Manager) findCurrentEventId() string {
    // Prefer PB events.isCurrent
    rec, err := m.App.FindFirstRecordByFilter("events", "isCurrent = true", nil)
    if err == nil && rec != nil {
        return rec.GetString("sourceId")
    }
    return ""
}

func hash32(s string) uint32 {
    h := fnv.New32a()
    _, _ = h.Write([]byte(s))
    return h.Sum32()
}

// isEnabled checks server_settings key `scheduler.enabled` (default true).
func (m *Manager) isEnabled() bool {
    rec, err := m.App.FindFirstRecordByFilter("server_settings", "key = 'scheduler.enabled'", nil)
    if err != nil || rec == nil { return true }
    val := strings.ToLower(strings.TrimSpace(rec.GetString("value")))
    return !(val == "false" || val == "0" || val == "off")
}

func (m *Manager) ensureDefaultSettings() {
    defaults := map[string]string{
        "scheduler.enabled":        "true",
        "scheduler.fullIntervalMs": "10000",
        "scheduler.workerIntervalMs":"200",
        "scheduler.activeCheckMs":  "1000",
        "scheduler.raceActiveMs":   "200",
        "scheduler.raceIdleMs":     "5000",
        "scheduler.resultsMs":      "2000",
        "scheduler.jitterMs":       "150",
        "scheduler.burst":          "2",
        "scheduler.concurrency":    "1",
    }
    col, err := m.App.FindCollectionByNameOrId("server_settings")
    if err != nil { return }
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
        if err != nil || rec == nil { return def }
        var n int
        if _, err := fmt.Sscanf(rec.GetString("value"), "%d", &n); err == nil { return n }
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

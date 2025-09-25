package scheduler

import (
	"database/sql"
	"errors"
	"strconv"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "drone-dashboard/migrations"
)

func TestManagerReloadSchedulerConfigAppliesSettings(t *testing.T) {
	t.Helper()

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("new test app: %v", err)
	}
	t.Cleanup(app.Cleanup)

	manager := NewManager(app, nil, Config{})
	manager.RegisterHooks()

	initialCfg := Config{
		FullInterval:     2 * time.Second,
		WorkerInterval:   100 * time.Millisecond,
		RaceActive:       150 * time.Millisecond,
		RaceIdle:         3 * time.Second,
		ResultsInterval:  500 * time.Millisecond,
		ChannelsInterval: 4 * time.Second,
		JitterMs:         75,
		Concurrency:      2,
	}
	seedSchedulerSettings(t, app, initialCfg)

	loaded := manager.loadConfigFromDB()
	if loaded != initialCfg {
		t.Fatalf("loaded config mismatch: got %#v want %#v", loaded, initialCfg)
	}
	manager.setConfig(loaded)
	manager.resetWorkerLimiter()

	event := createRecord(t, app, "events", map[string]any{
		"source":    "fpv",
		"sourceId":  "evt-1",
		"name":      "Test Event",
		"isCurrent": true,
	})
	round := createRecord(t, app, "rounds", map[string]any{
		"sourceId": "round-1",
		"event":    event.Id,
		"order":    1,
		"name":     "Round 1",
	})
	createRecord(t, app, "races", map[string]any{
		"sourceId":   "race-active",
		"event":      event.Id,
		"round":      round.Id,
		"raceNumber": 1,
		"valid":      true,
		"start":      "2025-01-01T00:00:00Z",
		"end":        "",
		"raceOrder":  1,
	})
	createRecord(t, app, "races", map[string]any{
		"sourceId":   "race-other",
		"event":      event.Id,
		"round":      round.Id,
		"raceNumber": 2,
		"valid":      true,
		"start":      "",
		"end":        "",
		"raceOrder":  2,
	})

	now := time.Now()
	manager.upsertTarget("event", "evt-1", event.Id, initialCfg.FullInterval, now)
	manager.upsertTarget("pilots", "evt-1", event.Id, initialCfg.FullInterval, now)
	manager.upsertTarget("channels", "evt-1", event.Id, initialCfg.ChannelsInterval, now)
	manager.upsertTarget("rounds", "evt-1", event.Id, initialCfg.FullInterval, now, 1)
	manager.upsertTarget("results", "evt-1", event.Id, initialCfg.ResultsInterval, now)
	manager.upsertTarget("race", "race-active", event.Id, initialCfg.RaceIdle, now)
	manager.upsertTarget("race", "race-other", event.Id, initialCfg.RaceIdle, now)
	manager.ensureActiveRacePriority()

	updatedCfg := Config{
		FullInterval:     750 * time.Millisecond,
		WorkerInterval:   80 * time.Millisecond,
		RaceActive:       220 * time.Millisecond,
		RaceIdle:         6400 * time.Millisecond,
		ResultsInterval:  900 * time.Millisecond,
		ChannelsInterval: 12500 * time.Millisecond,
		JitterMs:         33,
		Concurrency:      4,
	}
	seedSchedulerSettings(t, app, updatedCfg)
	manager.reloadSchedulerConfig("test")

	cfg := manager.currentConfig()
	if cfg != updatedCfg {
		t.Fatalf("reload config mismatch: got %#v want %#v", cfg, updatedCfg)
	}

	manager.workerSlotsMu.RLock()
	slots := manager.workerSlots
	manager.workerSlotsMu.RUnlock()
	if slots == nil {
		t.Fatalf("worker slots not initialized")
	}
	if cap(slots) != updatedCfg.Concurrency {
		t.Fatalf("worker limiter cap mismatch: got %d want %d", cap(slots), updatedCfg.Concurrency)
	}

	eventTarget := getIngestTarget(t, app, "event", "evt-1")
	if eventTarget.GetInt("intervalMs") != int(updatedCfg.FullInterval.Milliseconds()) {
		t.Fatalf("event target interval mismatch: got %d", eventTarget.GetInt("intervalMs"))
	}
	pilotsTarget := getIngestTarget(t, app, "pilots", "evt-1")
	if pilotsTarget.GetInt("intervalMs") != int(updatedCfg.FullInterval.Milliseconds()) {
		t.Fatalf("pilots interval mismatch: got %d", pilotsTarget.GetInt("intervalMs"))
	}
	roundsTarget := getIngestTarget(t, app, "rounds", "evt-1")
	if roundsTarget.GetInt("intervalMs") != int(updatedCfg.FullInterval.Milliseconds()) {
		t.Fatalf("rounds interval mismatch: got %d", roundsTarget.GetInt("intervalMs"))
	}
	if roundsTarget.GetInt("priority") != 1 {
		t.Fatalf("rounds priority mismatch: got %d", roundsTarget.GetInt("priority"))
	}
	channelsTarget := getIngestTarget(t, app, "channels", "evt-1")
	if channelsTarget.GetInt("intervalMs") != int(updatedCfg.ChannelsInterval.Milliseconds()) {
		t.Fatalf("channels interval mismatch: got %d", channelsTarget.GetInt("intervalMs"))
	}
	resultsTarget := getIngestTarget(t, app, "results", "evt-1")
	if resultsTarget.GetInt("intervalMs") != int(updatedCfg.ResultsInterval.Milliseconds()) {
		t.Fatalf("results interval mismatch: got %d", resultsTarget.GetInt("intervalMs"))
	}

	raceActive := getIngestTarget(t, app, "race", "race-active")
	if raceActive.GetInt("intervalMs") != int(updatedCfg.RaceActive.Milliseconds()) {
		t.Fatalf("active race interval mismatch: got %d", raceActive.GetInt("intervalMs"))
	}
	if raceActive.GetInt("priority") != 100 {
		t.Fatalf("active race priority mismatch: got %d", raceActive.GetInt("priority"))
	}
	raceIdle := getIngestTarget(t, app, "race", "race-other")
	if raceIdle.GetInt("intervalMs") != int(updatedCfg.RaceIdle.Milliseconds()) {
		t.Fatalf("idle race interval mismatch: got %d", raceIdle.GetInt("intervalMs"))
	}
	if raceIdle.GetInt("priority") != 0 {
		t.Fatalf("idle race priority mismatch: got %d", raceIdle.GetInt("priority"))
	}

	setSetting(t, app, "scheduler.resultsMs", "0")
	manager.reloadSchedulerConfig("disable-results")
	deleted, err := app.FindFirstRecordByFilter("ingest_targets", "type = 'results' && sourceId = {:sid}", dbx.Params{"sid": "evt-1"})
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("lookup results target: %v", err)
	}
	if deleted != nil {
		t.Fatalf("results target should be removed when interval is zero")
	}

	setSetting(t, app, "scheduler.concurrency", "6")
	waitFor(t, time.Second, func() bool {
		return manager.currentConfig().Concurrency == 6
	})
	manager.workerSlotsMu.RLock()
	slots = manager.workerSlots
	manager.workerSlotsMu.RUnlock()
	if cap(slots) != 6 {
		t.Fatalf("hook reload did not resize limiter: got %d", cap(slots))
	}
}

func seedSchedulerSettings(t testing.TB, app core.App, cfg Config) {
	t.Helper()
	setSetting(t, app, "scheduler.fullIntervalMs", intToString(cfg.FullInterval.Milliseconds()))
	setSetting(t, app, "scheduler.workerIntervalMs", intToString(cfg.WorkerInterval.Milliseconds()))
	setSetting(t, app, "scheduler.raceActiveMs", intToString(cfg.RaceActive.Milliseconds()))
	setSetting(t, app, "scheduler.raceIdleMs", intToString(cfg.RaceIdle.Milliseconds()))
	setSetting(t, app, "scheduler.resultsMs", intToString(cfg.ResultsInterval.Milliseconds()))
	setSetting(t, app, "scheduler.channelsIntervalMs", intToString(cfg.ChannelsInterval.Milliseconds()))
	setSetting(t, app, "scheduler.concurrency", intToString(int64(cfg.Concurrency)))
	setSetting(t, app, "scheduler.jitterMs", intToString(int64(cfg.JitterMs)))
}

func intToString(v int64) string {
	return strconv.FormatInt(v, 10)
}

func setSetting(t testing.TB, app core.App, key, value string) {
	t.Helper()
	rec, err := app.FindFirstRecordByFilter("server_settings", "key = {:k}", dbx.Params{"k": key})
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("find setting %s: %v", key, err)
	}
	if rec == nil || errors.Is(err, sql.ErrNoRows) {
		col, err := app.FindCollectionByNameOrId("server_settings")
		if err != nil {
			t.Fatalf("setting collection: %v", err)
		}
		rec = core.NewRecord(col)
		rec.Set("key", key)
	}
	rec.Set("value", value)
	if err := app.Save(rec); err != nil {
		t.Fatalf("save setting %s: %v", key, err)
	}
}

func createRecord(t testing.TB, app core.App, collection string, fields map[string]any) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		t.Fatalf("find collection %s: %v", collection, err)
	}
	rec := core.NewRecord(col)
	for k, v := range fields {
		rec.Set(k, v)
	}
	if err := app.Save(rec); err != nil {
		t.Fatalf("save %s record: %v", collection, err)
	}
	return rec
}

func getIngestTarget(t testing.TB, app core.App, typ, sourceID string) *core.Record {
	t.Helper()
	rec, err := app.FindFirstRecordByFilter("ingest_targets", "type = {:t} && sourceId = {:sid}", dbx.Params{"t": typ, "sid": sourceID})
	if err != nil {
		t.Fatalf("find target %s/%s: %v", typ, sourceID, err)
	}
	if rec == nil {
		t.Fatalf("target %s/%s not found", typ, sourceID)
	}
	return rec
}

func waitFor(t testing.TB, timeout time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("condition not met within %v", timeout)
}

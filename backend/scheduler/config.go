package scheduler

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type Config struct {
	FullInterval     time.Duration
	WorkerInterval   time.Duration
	RaceActive       time.Duration
	RaceIdle         time.Duration
	ResultsInterval  time.Duration
	ChannelsInterval time.Duration
	JitterMs         int
	Concurrency      int
}

func (m *Manager) ensureDefaultSettings() {
	defaults := map[string]string{
		"scheduler.enabled":          "true",
		"scheduler.fullIntervalMs":   "10000",
		"scheduler.workerIntervalMs": "200",
		"scheduler.raceActiveMs":     "200",
		"scheduler.raceIdleMs":       "10000",
		// Treat resultsMs <= 0 as disabled
		"scheduler.resultsMs":          "0",
		"scheduler.channelsIntervalMs": "60000",
		"scheduler.jitterMs":           "150",
		"scheduler.concurrency":        "2",
		"ui.title":                     "Drone Dashboard",
	}
	col, err := m.App.FindCollectionByNameOrId("server_settings")
	if err != nil {
		slog.Warn("scheduler.config.seed.collection.error", "err", err)
		return
	}
	for k, v := range defaults {
		rec, _ := m.App.FindFirstRecordByFilter("server_settings", "key = {:k}", dbx.Params{"k": k})
		if rec == nil {
			rec = core.NewRecord(col)
			rec.Set("key", k)
			rec.Set("value", v)
			if err := m.App.Save(rec); err != nil {
				slog.Warn("scheduler.config.seed.save.error", "key", k, "err", err)
			}
		}
	}
}

func (m *Manager) loadConfigFromDB() Config {
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
	cfg := Config{}
	cfg.FullInterval = time.Duration(readInt("scheduler.fullIntervalMs", 10000)) * time.Millisecond
	cfg.WorkerInterval = time.Duration(readInt("scheduler.workerIntervalMs", 200)) * time.Millisecond
	cfg.RaceActive = time.Duration(readInt("scheduler.raceActiveMs", 200)) * time.Millisecond
	cfg.RaceIdle = time.Duration(readInt("scheduler.raceIdleMs", 5000)) * time.Millisecond
	cfg.ResultsInterval = time.Duration(readInt("scheduler.resultsMs", 2000)) * time.Millisecond
	cfg.ChannelsInterval = time.Duration(readInt("scheduler.channelsIntervalMs", 60000)) * time.Millisecond
	cfg.Concurrency = readInt("scheduler.concurrency", 2)
	cfg.JitterMs = readInt("scheduler.jitterMs", 150)
	return cfg
}

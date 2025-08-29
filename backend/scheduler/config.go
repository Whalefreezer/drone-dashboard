package scheduler

import (
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type Config struct {
	FullInterval    time.Duration
	WorkerInterval  time.Duration
	RaceActive      time.Duration
	RaceIdle        time.Duration
	ResultsInterval time.Duration
	Concurrency     int
	Burst           int
	JitterMs        int
}

func (m *Manager) ensureDefaultSettings() {
	defaults := map[string]string{
		"scheduler.enabled":          "true",
		"scheduler.fullIntervalMs":   "10000",
		"scheduler.workerIntervalMs": "200",
		"scheduler.raceActiveMs":     "200",
		"scheduler.raceIdleMs":       "10000",
		"scheduler.resultsMs":        "10000",
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
	m.Cfg.RaceActive = time.Duration(readInt("scheduler.raceActiveMs", 200)) * time.Millisecond
	m.Cfg.RaceIdle = time.Duration(readInt("scheduler.raceIdleMs", 5000)) * time.Millisecond
	m.Cfg.ResultsInterval = time.Duration(readInt("scheduler.resultsMs", 2000)) * time.Millisecond
	m.Cfg.Burst = readInt("scheduler.burst", 2)
	m.Cfg.Concurrency = readInt("scheduler.concurrency", 1)
	m.Cfg.JitterMs = readInt("scheduler.jitterMs", 150)
}

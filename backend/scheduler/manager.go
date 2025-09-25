package scheduler

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"drone-dashboard/ingest"

	"github.com/pocketbase/pocketbase/core"
)

type Manager struct {
	App     core.App
	Service *ingest.Service

	cfgMu sync.RWMutex
	cfg   Config

	discoveryTickerMu sync.Mutex
	discoveryTicker   *time.Ticker

	workerTickerMu sync.Mutex
	workerTicker   *time.Ticker

	workerSlotsMu sync.RWMutex
	workerSlots   chan struct{}

	reloadMu sync.Mutex
}

func NewManager(app core.App, service *ingest.Service, cfg Config) *Manager {
	m := &Manager{App: app, Service: service}
	m.setConfig(cfg)
	return m
}

// StartLoops spawns the discovery, worker, and active race goroutines.
func (m *Manager) StartLoops(ctx context.Context) {
	// seed defaults if missing
	m.ensureDefaultSettings()
	// load settings-derived config
	loaded := m.loadConfigFromDB()
	m.setConfig(loaded)
	m.resetWorkerLimiter()
	// initial promotion of active race / order publish
	if m.isEnabled() {
		m.ensureActiveRacePriority()
	}
	// Discovery loop
	go func() {
		cfg := m.currentConfig()
		interval := cfg.FullInterval
		if interval <= 0 {
			interval = time.Second
		}
		ticker := time.NewTicker(interval)
		m.setDiscoveryTicker(ticker)
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
		cfg := m.currentConfig()
		interval := cfg.WorkerInterval
		if interval <= 0 {
			interval = 100 * time.Millisecond
		}
		ticker := time.NewTicker(interval)
		m.setWorkerTicker(ticker)
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

func (m *Manager) currentConfig() Config {
	m.cfgMu.RLock()
	defer m.cfgMu.RUnlock()
	return m.cfg
}

func (m *Manager) setConfig(cfg Config) {
	m.cfgMu.Lock()
	m.cfg = cfg
	m.cfgMu.Unlock()
}

func (m *Manager) setDiscoveryTicker(t *time.Ticker) {
	m.discoveryTickerMu.Lock()
	m.discoveryTicker = t
	m.discoveryTickerMu.Unlock()
}

func (m *Manager) setWorkerTicker(t *time.Ticker) {
	m.workerTickerMu.Lock()
	m.workerTicker = t
	m.workerTickerMu.Unlock()
}

func (m *Manager) resetDiscoveryTicker(interval time.Duration) {
	if interval <= 0 {
		interval = time.Second
	}
	m.discoveryTickerMu.Lock()
	ticker := m.discoveryTicker
	m.discoveryTickerMu.Unlock()
	if ticker != nil {
		ticker.Reset(interval)
	}
}

func (m *Manager) resetWorkerTicker(interval time.Duration) {
	if interval <= 0 {
		interval = 100 * time.Millisecond
	}
	m.workerTickerMu.Lock()
	ticker := m.workerTicker
	m.workerTickerMu.Unlock()
	if ticker != nil {
		ticker.Reset(interval)
	}
}

func (m *Manager) resetWorkerLimiter() {
	cfg := m.currentConfig()
	limit := cfg.Concurrency
	if limit <= 0 {
		limit = 1
	}
	m.workerSlotsMu.Lock()
	defer m.workerSlotsMu.Unlock()
	if m.workerSlots != nil && cap(m.workerSlots) == limit {
		return
	}
	m.workerSlots = make(chan struct{}, limit)
}

func (m *Manager) registerSchedulerSettingHooks() {
	handle := func(op string) func(*core.RecordEvent) error {
		return func(e *core.RecordEvent) error {
			var key string
			if e != nil && e.Record != nil {
				key = strings.TrimSpace(e.Record.GetString("key"))
			}
			if m.shouldReloadForSetting(key) {
				reason := fmt.Sprintf("%s:%s", op, key)
				go m.reloadSchedulerConfig(reason)
			}
			return e.Next()
		}
	}

	m.App.OnRecordAfterCreateSuccess("server_settings").BindFunc(handle("create"))
	m.App.OnRecordAfterUpdateSuccess("server_settings").BindFunc(handle("update"))
	m.App.OnRecordAfterDeleteSuccess("server_settings").BindFunc(handle("delete"))
}

func (m *Manager) shouldReloadForSetting(key string) bool {
	if key == "" {
		return false
	}
	return strings.HasPrefix(key, "scheduler.")
}

func (m *Manager) reloadSchedulerConfig(reason string) {
	m.reloadMu.Lock()
	defer m.reloadMu.Unlock()

	prev := m.currentConfig()
	newCfg := m.loadConfigFromDB()
	m.setConfig(newCfg)

	m.resetDiscoveryTicker(newCfg.FullInterval)
	m.resetWorkerTicker(newCfg.WorkerInterval)
	m.resetWorkerLimiter()

	counts, err := m.reapplyTargetIntervals(newCfg)
	if err != nil {
		slog.Error("scheduler.reload.error", "reason", reason, "err", err)
	} else {
		slog.Info(
			"scheduler.reload.success",
			"reason", reason,
			"changed", prev != newCfg,
			"fullIntervalMs", newCfg.FullInterval.Milliseconds(),
			"workerIntervalMs", newCfg.WorkerInterval.Milliseconds(),
			"raceActiveMs", newCfg.RaceActive.Milliseconds(),
			"raceIdleMs", newCfg.RaceIdle.Milliseconds(),
			"resultsIntervalMs", newCfg.ResultsInterval.Milliseconds(),
			"channelsIntervalMs", newCfg.ChannelsInterval.Milliseconds(),
			"concurrency", newCfg.Concurrency,
			"jitterMs", newCfg.JitterMs,
			"targetsTouched", counts,
		)
	}

	m.ensureActiveRacePriority()
}

func (m *Manager) reapplyTargetIntervals(cfg Config) (map[string]int, error) {
	if _, err := m.App.FindCollectionByNameOrId("ingest_targets"); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return map[string]int{}, nil
		}
		return nil, err
	}
	records, err := m.App.FindAllRecords("ingest_targets")
	if err != nil {
		return nil, err
	}
	now := time.Now()
	counts := make(map[string]int)
	for _, rec := range records {
		typeName := rec.GetString("type")
		sourceID := rec.GetString("sourceId")
		eventID := rec.GetString("event")
		switch typeName {
		case "event", "pilots":
			m.upsertTarget(typeName, sourceID, eventID, cfg.FullInterval, now)
		case "rounds":
			m.upsertTarget(typeName, sourceID, eventID, cfg.FullInterval, now, 1)
		case "channels":
			m.upsertTarget(typeName, sourceID, eventID, cfg.ChannelsInterval, now)
		case "results":
			m.upsertTarget(typeName, sourceID, eventID, cfg.ResultsInterval, now)
		case "race":
			m.upsertTarget(typeName, sourceID, eventID, cfg.RaceIdle, now)
		default:
			continue
		}
		counts[typeName]++
	}
	return counts, nil
}

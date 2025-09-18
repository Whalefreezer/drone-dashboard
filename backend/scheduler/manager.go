package scheduler

import (
	"context"
	"sync"
	"time"

	"drone-dashboard/ingest"

	"github.com/pocketbase/pocketbase/core"
)

type Manager struct {
	App     core.App
	Service *ingest.Service
	Cfg     Config

	workerSlotsOnce sync.Once
	workerSlots     chan struct{}
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

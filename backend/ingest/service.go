package ingest

import (
	"fmt"
	"log/slog"

	"github.com/pocketbase/pocketbase/core"
)

type Service struct {
	Source   Source
	Upserter *Upserter
}

func NewService(app core.App, baseURL string) (*Service, error) {
	client, err := NewFPVClient(baseURL)
	if err != nil {
		return nil, err
	}
	return &Service{Source: DirectSource{C: client}, Upserter: NewUpserter(app)}, nil
}

func NewServiceWithSource(app core.App, src Source) *Service {
	return &Service{Source: src, Upserter: NewUpserter(app)}
}

// PurgeSummary captures the results of a purge operation
type PurgeSummary struct {
	Events        int `json:"events"`
	Rounds        int `json:"rounds"`
	Pilots        int `json:"pilots"`
	Channels      int `json:"channels"`
	Tracks        int `json:"tracks"`
	Races         int `json:"races"`
	PilotChannels int `json:"pilotChannels"`
	Detections    int `json:"detections"`
	Laps          int `json:"laps"`
	GamePoints    int `json:"gamePoints"`
	Results       int `json:"results"`
	IngestTargets int `json:"ingestTargets"`
	CurrentOrders int `json:"currentOrders"`
	ControlStats  int `json:"controlStats"`
}

// Purge removes all FPVTrackside-derived data from the database, including current race order state
func (s *Service) Purge() (*PurgeSummary, error) {
	summary := &PurgeSummary{}

	// Use a transaction to ensure atomicity
	err := s.Upserter.App.RunInTransaction(func(txApp core.App) error {
		// Delete in dependency order (reverse of creation)
		collections := []string{
			"results",
			"gamePoints",
			"laps",
			"detections",
			"pilotChannels",
			"races",
			"tracks",
			"channels",
			"pilots",
			"rounds",
			"events",
		}

		for _, col := range collections {
			records, err := txApp.FindRecordsByFilter(col, "source = 'fpvtrackside'", "", 0, 0, nil)
			if err != nil {
				return fmt.Errorf("failed to find records in %s: %w", col, err)
			}
			count := 0
			for _, rec := range records {
				if err := txApp.Delete(rec); err != nil {
					return fmt.Errorf("failed to delete record from %s: %w", col, err)
				}
				count++
			}
			switch col {
			case "events":
				summary.Events = count
			case "rounds":
				summary.Rounds = count
			case "pilots":
				summary.Pilots = count
			case "channels":
				summary.Channels = count
			case "tracks":
				summary.Tracks = count
			case "races":
				summary.Races = count
			case "pilotChannels":
				summary.PilotChannels = count
			case "detections":
				summary.Detections = count
			case "laps":
				summary.Laps = count
			case "gamePoints":
				summary.GamePoints = count
			case "results":
				summary.Results = count
			}
		}

		// Clear all ingest_targets (scheduler will recreate them)
		itRecords, err := txApp.FindRecordsByFilter("ingest_targets", "", "", 0, 0, nil)
		if err != nil {
			return fmt.Errorf("failed to find ingest_targets: %w", err)
		}
		for _, rec := range itRecords {
			if err := txApp.Delete(rec); err != nil {
				return fmt.Errorf("failed to delete ingest_target: %w", err)
			}
		}
		summary.IngestTargets = len(itRecords)

		// Clear client_kv records for current race order (namespace="race", key="currentOrder")
		// This is optional - if it fails, log but don't fail the purge
		ckvRecords, err := txApp.FindRecordsByFilter("client_kv", "namespace = 'race' && key = 'currentOrder'", "", 0, 0, nil)
		if err != nil {
			slog.Warn("failed to find client_kv currentOrder records, skipping", "err", err)
			summary.CurrentOrders = 0
		} else {
			for _, rec := range ckvRecords {
				if err := txApp.Delete(rec); err != nil {
					slog.Warn("failed to delete client_kv currentOrder record, skipping", "err", err)
				} else {
					summary.CurrentOrders++
				}
			}
		}

		// Clear control_stats
		csRecords, err := txApp.FindRecordsByFilter("control_stats", "", "", 0, 0, nil)
		if err != nil {
			return fmt.Errorf("failed to find control_stats: %w", err)
		}
		for _, rec := range csRecords {
			if err := txApp.Delete(rec); err != nil {
				return fmt.Errorf("failed to delete control_stats: %w", err)
			}
		}
		summary.ControlStats = len(csRecords)

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Clear in-memory caches
	s.clearInMemoryCaches()

	slog.Info("purge completed", "summary", summary)
	return summary, nil
}

// clearInMemoryCaches clears any cached data in the source
func (s *Service) clearInMemoryCaches() {
	// Clear RemoteSource ETag cache if applicable
	if rs, ok := s.Source.(*RemoteSource); ok {
		rs.cache = make(map[string]cached)
		// Clear current race provider cache via hub
		if rs.Hub != nil {
			rs.Hub.ClearCurrentRaceCache()
		}
	}
}

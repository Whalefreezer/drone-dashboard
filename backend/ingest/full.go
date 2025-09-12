package ingest

import (
	"fmt"
	"log/slog"
	"time"
)

// FullSummary contains simple counters for a full event backfill
type FullSummary struct {
	Ok              bool   `json:"ok"`
	EventId         string `json:"eventId"`
	RacesProcessed  int    `json:"racesProcessed"`
	RacesSucceeded  int    `json:"racesSucceeded"`
	RacesFailed     int    `json:"racesFailed"`
	ResultsIngested int    `json:"resultsIngested"`
}

// Full orchestrates a full ingestion for an event: snapshot -> all races -> results
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) Full(eventSourceId string) (FullSummary, error) {
	slog.Debug("ingest.full.start", "eventSourceId", eventSourceId)

	// Fetch event to enumerate races
	events, err := s.Source.FetchEvent(eventSourceId)
	if err != nil {
		return FullSummary{EventId: eventSourceId}, fmt.Errorf("fetch event: %w", err)
	}
	if len(events) == 0 {
		return FullSummary{EventId: eventSourceId}, fmt.Errorf("event not found: %s", eventSourceId)
	}
	e := events[0]

	// 1) Snapshot core entities
	if err := s.Snapshot(eventSourceId); err != nil {
		return FullSummary{EventId: eventSourceId}, fmt.Errorf("snapshot: %w", err)
	}

	// 2) Races with simple retry and pacing
	racesProcessed := 0
	racesSucceeded := 0
	racesFailed := 0
	for _, raceID := range e.Races {
		racesProcessed++
		var lastErr error
		// retry policy: up to 3 attempts with exponential backoff
		for attempt := 0; attempt < 3; attempt++ {
			if attempt > 0 {
				backoff := 200 * time.Millisecond << attempt // 200ms, 400ms, 800ms
				time.Sleep(backoff)
			}
			if err := s.IngestRace(string(e.ID), string(raceID)); err != nil {
				lastErr = err
				slog.Warn("ingest.full.race.retry", "eventSourceId", eventSourceId, "raceId", raceID, "attempt", attempt+1, "err", err)
				continue
			}
			// success
			racesSucceeded++
			lastErr = nil
			break
		}
		if lastErr != nil {
			racesFailed++
		}
		// soft rate limit between races
		time.Sleep(50 * time.Millisecond)
	}

	// 3) Results
	cnt, err := s.IngestResults(eventSourceId)
	if err != nil {
		return FullSummary{
			EventId:        eventSourceId,
			RacesProcessed: racesProcessed,
			RacesSucceeded: racesSucceeded,
			RacesFailed:    racesFailed,
		}, fmt.Errorf("results: %w", err)
	}

	summary := FullSummary{
		Ok:              true,
		EventId:         eventSourceId,
		RacesProcessed:  racesProcessed,
		RacesSucceeded:  racesSucceeded,
		RacesFailed:     racesFailed,
		ResultsIngested: cnt,
	}
	slog.Info("ingest.full.done", "eventSourceId", eventSourceId, "processed", racesProcessed, "ok", racesSucceeded, "failed", racesFailed)
	return summary, nil
}

// FullAuto fetches the event sourceId automatically and then performs a full ingestion
func (s *Service) FullAuto() (FullSummary, error) {
	slog.Debug("ingest.fullAuto.start")

	// Fetch event sourceId using the same method as frontend
	eventSourceId, err := s.Source.FetchEventSourceId()
	if err != nil {
		return FullSummary{}, fmt.Errorf("fetch event sourceId: %w", err)
	}

	slog.Info("ingest.fullAuto.eventSourceId", "eventSourceId", eventSourceId)

	// Perform full ingestion with the fetched event sourceId
	summary, err := s.Full(eventSourceId)
	if err != nil {
		return summary, err
	}

	// After successful full ingestion, set this event as current and all others as not current
	if err := s.SetEventAsCurrent(eventSourceId); err != nil {
		slog.Warn("ingest.fullAuto.setEventAsCurrent.failed", "eventSourceId", eventSourceId, "err", err)
		// Don't fail the entire operation if setting current status fails
	}

	return summary, nil
}

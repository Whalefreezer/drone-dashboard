package ingest

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

type Service struct {
	Client   *FPVClient
	Upserter *Upserter
}

func NewService(app core.App, baseURL string) (*Service, error) {
	client, err := NewFPVClient(baseURL)
	if err != nil {
		return nil, err
	}
	return &Service{Client: client, Upserter: NewUpserter(app)}, nil
}

// Snapshot ingests Event, Pilots, Channels, Rounds for an eventId
func (s *Service) Snapshot(eventId string) error {
	slog.Info("ingest.snapshot.start", "eventId", eventId)
	// Fetch
	events, err := s.Client.FetchEvent(eventId)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		return fmt.Errorf("event not found: %s", eventId)
	}

	pilots, err := s.Client.FetchPilots(eventId)
	if err != nil {
		return err
	}
	channels, err := s.Client.FetchChannels()
	if err != nil {
		return err
	}
	rounds, err := s.Client.FetchRounds(eventId)
	if err != nil {
		return err
	}

	// Upsert event
	e := events[0]
	eventPBID, err := s.Upserter.Upsert("events", string(e.ID), map[string]any{
		"name":                        e.Name,
		"eventType":                   e.EventType,
		"start":                       e.Start,
		"end":                         e.End,
		"laps":                        e.Laps,
		"pbLaps":                      e.PBLaps,
		"packLimit":                   e.PackLimit,
		"raceLength":                  e.RaceLength,
		"minStartDelay":               e.MinStartDelay,
		"maxStartDelay":               e.MaxStartDelay,
		"primaryTimingSystemLocation": e.PrimaryTimingSystemLocation,
		"raceStartIgnoreDetections":   e.RaceStartIgnoreDetections,
		"minLapTime":                  e.MinLapTime,
		"lastOpened":                  e.LastOpened,
	})
	if err != nil {
		return err
	}

	// Upsert channels (global)
	for _, ch := range channels {
		if _, err := s.Upserter.Upsert("channels", string(ch.ID), map[string]any{
			"number":        ch.Number,
			"band":          ch.Band,
			"shortBand":     ch.ShortBand,
			"channelPrefix": ch.ChannelPrefix,
			"frequency":     ch.Frequency,
			"displayName":   ch.DisplayName,
		}); err != nil {
			return err
		}
	}

	// Upsert pilots (global)
	for _, p := range pilots {
		if _, err := s.Upserter.Upsert("pilots", string(p.ID), map[string]any{
			"name":          p.Name,
			"firstName":     p.FirstName,
			"lastName":      p.LastName,
			"discordId":     p.DiscordID,
			"practicePilot": p.PracticePilot,
		}); err != nil {
			return err
		}
	}

	// Upsert rounds (event-scoped)
	for _, r := range rounds {
		if _, err := s.Upserter.Upsert("rounds", string(r.ID), map[string]any{
			"name":        r.Name,
			"roundNumber": r.RoundNumber,
			"eventType":   r.EventType,
			"roundType":   r.RoundType,
			"valid":       r.Valid,
			"order":       r.Order,
			"event":       eventPBID,
		}); err != nil {
			return err
		}
	}

	slog.Info("ingest.snapshot.done", "eventId", eventId, "pilots", len(pilots), "channels", len(channels), "rounds", len(rounds))
	return nil
}

// IngestRace fetches and upserts a race and its nested entities
func (s *Service) IngestRace(eventId, raceId string) error {
	slog.Info("ingest.race.start", "eventId", eventId, "raceId", raceId)
	// Ensure event exists (and get PB id)
	events, err := s.Client.FetchEvent(eventId)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		return fmt.Errorf("event not found: %s", eventId)
	}

	e := events[0]
	eventPBID, err := s.Upserter.Upsert("events", string(e.ID), map[string]any{
		"name": e.Name,
	})
	if err != nil {
		return err
	}

	// Fetch race payload
	rf, err := s.Client.FetchRace(eventId, raceId)
	if err != nil {
		return err
	}
	if len(rf) == 0 {
		return fmt.Errorf("race not found: %s", raceId)
	}
	r := rf[0]

	// Ensure round exists and resolve PB id (rounds should be ingested by snapshot)
	roundPBID, err := s.Upserter.Upsert("rounds", string(r.Round), map[string]any{})
	if err != nil {
		return err
	}

	// Upsert race
	racePBID, err := s.Upserter.Upsert("races", string(r.ID), map[string]any{
		"raceNumber":                  r.RaceNumber,
		"start":                       r.Start,
		"end":                         r.End,
		"totalPausedTime":             r.TotalPausedTime,
		"primaryTimingSystemLocation": r.PrimaryTimingSystemLocation,
		"valid":                       r.Valid,
		"bracket":                     r.Bracket,
		"event":                       eventPBID,
		"round":                       roundPBID,
	})
	if err != nil {
		return err
	}

	// PilotChannels for this race (scoped by event)
	for _, pc := range r.PilotChannels {
		// resolve pilot, channel
		pilotPBID, err := s.Upserter.Upsert("pilots", string(pc.Pilot), map[string]any{})
		if err != nil {
			return err
		}
		channelPBID, err := s.Upserter.Upsert("channels", string(pc.Channel), map[string]any{})
		if err != nil {
			return err
		}
		if _, err := s.Upserter.Upsert("pilotChannels", string(pc.ID), map[string]any{
			"pilot":   pilotPBID,
			"channel": channelPBID,
			"event":   eventPBID,
		}); err != nil {
			return err
		}
	}

	// Detections
	for _, d := range r.Detections {
		pilotPBID, err := s.Upserter.Upsert("pilots", string(d.Pilot), map[string]any{})
		if err != nil {
			return err
		}
		channelPBID, err := s.Upserter.Upsert("channels", string(d.Channel), map[string]any{})
		if err != nil {
			return err
		}
		if _, err := s.Upserter.Upsert("detections", string(d.ID), map[string]any{
			"timingSystemIndex": d.TimingSystemIndex,
			"time":              d.Time,
			"peak":              d.Peak,
			"timingSystemType":  d.TimingSystemType,
			"lapNumber":         d.LapNumber,
			"valid":             d.Valid,
			"validityType":      d.ValidityType,
			"isLapEnd":          d.IsLapEnd,
			"raceSector":        d.RaceSector,
			"isHoleshot":        d.IsHoleshot,
			"pilot":             pilotPBID,
			"race":              racePBID,
			"channel":           channelPBID,
		}); err != nil {
			return err
		}
	}

	// Laps
	for _, l := range r.Laps {
		if _, err := s.Upserter.Upsert("laps", string(l.ID), map[string]any{
			"lapNumber":     l.LapNumber,
			"lengthSeconds": l.LengthSeconds,
			"startTime":     l.StartTime,
			"endTime":       l.EndTime,
			"race":          racePBID,
		}); err != nil {
			return err
		}
	}

	// GamePoints
	for _, gp := range r.GamePoints {
		pilotPBID, err := s.Upserter.Upsert("pilots", string(gp.Pilot), map[string]any{})
		if err != nil {
			return err
		}
		channelPBID, err := s.Upserter.Upsert("channels", string(gp.Channel), map[string]any{})
		if err != nil {
			return err
		}
		if _, err := s.Upserter.Upsert("gamePoints", string(gp.ID), map[string]any{
			"valid":   gp.Valid,
			"time":    gp.Time,
			"pilot":   pilotPBID,
			"race":    racePBID,
			"channel": channelPBID,
		}); err != nil {
			return err
		}
	}

	slog.Info("ingest.race.done", "eventId", eventId, "raceId", raceId, "detections", len(r.Detections), "laps", len(r.Laps), "gamePoints", len(r.GamePoints))
	return nil
}

// IngestResults fetches aggregated results for the event and upserts them
func (s *Service) IngestResults(eventId string) error {
	slog.Info("ingest.results.start", "eventId", eventId)
	// Ensure event exists (and get PB id)
	events, err := s.Client.FetchEvent(eventId)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		return fmt.Errorf("event not found: %s", eventId)
	}
	e := events[0]
	eventPBID, err := s.Upserter.Upsert("events", string(e.ID), map[string]any{
		"name": e.Name,
	})
	if err != nil {
		return err
	}

	// Fetch results
	res, err := s.Client.FetchResults(eventId)
	if err != nil {
		return err
	}

	for _, r := range res {
		// Resolve optional race id (may be empty GUID in some contexts)
		var racePBID string
		if r.Race != "" {
			racePBID, err = s.Upserter.Upsert("races", string(r.Race), map[string]any{})
			if err != nil {
				return err
			}
		}
		pilotPBID, err := s.Upserter.Upsert("pilots", string(r.Pilot), map[string]any{})
		if err != nil {
			return err
		}

		if _, err := s.Upserter.Upsert("results", string(r.ID), map[string]any{
			"points":     r.Points,
			"position":   r.Position,
			"valid":      r.Valid,
			"dnf":        r.DNF,
			"resultType": r.ResultType,
			"event":      eventPBID,
			"race":       racePBID,
			"pilot":      pilotPBID,
		}); err != nil {
			return err
		}
	}
	slog.Info("ingest.results.done", "eventId", eventId, "results", len(res))
	return nil
}

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
func (s *Service) Full(eventId string) (FullSummary, error) {
	slog.Info("ingest.full.start", "eventId", eventId)

	// Fetch event to enumerate races
	events, err := s.Client.FetchEvent(eventId)
	if err != nil {
		return FullSummary{}, err
	}
	if len(events) == 0 {
		return FullSummary{}, fmt.Errorf("event not found: %s", eventId)
	}
	e := events[0]

	// 1) Snapshot core entities
	if err := s.Snapshot(eventId); err != nil {
		return FullSummary{}, err
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
				slog.Warn("ingest.full.race.retry", "eventId", eventId, "raceId", raceID, "attempt", attempt+1, "err", err)
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
	if err := s.IngestResults(eventId); err != nil {
		return FullSummary{}, err
	}

	// Count of results is not known without extra query; report 0 as placeholder
	summary := FullSummary{
		Ok:              true,
		EventId:         eventId,
		RacesProcessed:  racesProcessed,
		RacesSucceeded:  racesSucceeded,
		RacesFailed:     racesFailed,
		ResultsIngested: 0,
	}
	slog.Info("ingest.full.done", "eventId", eventId, "processed", racesProcessed, "ok", racesSucceeded, "failed", racesFailed)
	return summary, nil
}

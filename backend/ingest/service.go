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
		"isCurrent":                   true,
	})
	if err != nil {
		return err
	}

	// Upsert channels (global)
	// Filter to only the channels referenced by the RaceEvent and attach color/display name overrides by index
	// Build lookup of allowed channel IDs and index-based metadata
	allowed := map[string]struct{}{}
	colorByID := map[string]string{}
	displayOverrideByID := map[string]string{}
	for i, chID := range e.Channels {
		id := string(chID)
		allowed[id] = struct{}{}
		if i < len(e.ChannelColors) {
			colorByID[id] = e.ChannelColors[i]
		}
		if i < len(e.ChannelDisplayNames) {
			displayOverrideByID[id] = e.ChannelDisplayNames[i]
		}
	}
	for _, ch := range channels {
		id := string(ch.ID)
		if _, ok := allowed[id]; !ok {
			continue
		}
		fields := map[string]any{
			"number":             ch.Number,
			"band":               ch.Band,
			"shortBand":          ch.ShortBand,
			"channelPrefix":      ch.ChannelPrefix,
			"frequency":          ch.Frequency,
			"displayName":        ch.DisplayName,
			"channelColor":       colorByID[id],
			"channelDisplayName": displayOverrideByID[id],
			"event":              eventPBID,
		}
		if _, err := s.Upserter.Upsert("channels", id, fields); err != nil {
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
			"event":         eventPBID,
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
	// Get existing event PB id (event should already exist from snapshot)
	eventPBID, err := s.Upserter.GetExistingId("events", eventId)
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

	// Get existing round PB id (round should already exist from snapshot)
	roundPBID, err := s.Upserter.GetExistingId("rounds", string(r.Round))
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
		"targetLaps":                  r.TargetLaps,
		"event":                       eventPBID,
		"round":                       roundPBID,
	})
	if err != nil {
		return err
	}

	// PilotChannels for this race (scoped by event)
	for _, pc := range r.PilotChannels {
		// Get existing pilot and channel PB ids (should already exist from snapshot)
		pilotPBID, err := s.Upserter.GetExistingId("pilots", string(pc.Pilot))
		if err != nil {
			return err
		}
		channelPBID, err := s.Upserter.GetExistingId("channels", string(pc.Channel))
		if err != nil {
			return err
		}
		if _, err := s.Upserter.Upsert("pilotChannels", string(pc.ID), map[string]any{
			"pilot":   pilotPBID,
			"channel": channelPBID,
			"race":    racePBID,
			"event":   eventPBID,
		}); err != nil {
			return err
		}
	}

	// Detections
	for _, d := range r.Detections {
		pilotPBID, err := s.Upserter.GetExistingId("pilots", string(d.Pilot))
		if err != nil {
			return err
		}
		channelPBID, err := s.Upserter.GetExistingId("channels", string(d.Channel))
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
			"event":             eventPBID,
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
			"event":         eventPBID,
		}); err != nil {
			return err
		}
	}

	// GamePoints
	for _, gp := range r.GamePoints {
		pilotPBID, err := s.Upserter.GetExistingId("pilots", string(gp.Pilot))
		if err != nil {
			return err
		}
		channelPBID, err := s.Upserter.GetExistingId("channels", string(gp.Channel))
		if err != nil {
			return err
		}
		if _, err := s.Upserter.Upsert("gamePoints", string(gp.ID), map[string]any{
			"valid":   gp.Valid,
			"time":    gp.Time,
			"pilot":   pilotPBID,
			"race":    racePBID,
			"channel": channelPBID,
			"event":   eventPBID,
		}); err != nil {
			return err
		}
	}

	slog.Info("ingest.race.done", "eventId", eventId, "raceId", raceId, "detections", len(r.Detections), "laps", len(r.Laps), "gamePoints", len(r.GamePoints))
	return nil
}

// IngestResults fetches aggregated results for the event and upserts them
func (s *Service) IngestResults(eventId string) (int, error) {
	slog.Info("ingest.results.start", "eventId", eventId)
	// Get existing event PB id (event should already exist from snapshot)
	eventPBID, err := s.Upserter.GetExistingId("events", eventId)
	if err != nil {
		return 0, err
	}

	// Fetch results
	res, err := s.Client.FetchResults(eventId)
	if err != nil {
		return 0, err
	}

	for _, r := range res {
		// Resolve optional race id (may be empty GUID in some contexts)
		var racePBID string
		if r.Race != "" {
			racePBID, err = s.Upserter.GetExistingId("races", string(r.Race))
			if err != nil {
				return 0, err
			}
		}
		pilotPBID, err := s.Upserter.GetExistingId("pilots", string(r.Pilot))
		if err != nil {
			return 0, err
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
			return 0, err
		}
	}
	slog.Info("ingest.results.done", "eventId", eventId, "results", len(res))
	return len(res), nil
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

// setEventAsCurrent sets the specified event as current and makes all other events not current
func (s *Service) setEventAsCurrent(eventId string) error {
	slog.Info("ingest.setEventAsCurrent.start", "eventId", eventId)

	collection, err := s.Upserter.App.FindCollectionByNameOrId("events")
	if err != nil {
		return fmt.Errorf("find events collection: %w", err)
	}

	// Get all events and set the correct isCurrent value in one loop
	allEvents, err := s.Upserter.App.FindAllRecords(collection.Name)
	if err != nil {
		return fmt.Errorf("find all events: %w", err)
	}

	for _, event := range allEvents {
		// Check if this is the target event by comparing sourceId
		isCurrent := event.GetString("sourceId") == eventId
		event.Set("isCurrent", isCurrent)
		if err := s.Upserter.App.Save(event); err != nil {
			return fmt.Errorf("save event %s with isCurrent=%t: %w", event.Id, isCurrent, err)
		}
	}

	slog.Info("ingest.setEventAsCurrent.done", "eventId", eventId, "totalEvents", len(allEvents))
	return nil
}

// Full orchestrates a full ingestion for an event: snapshot -> all races -> results
func (s *Service) Full(eventId string) (FullSummary, error) {
	slog.Info("ingest.full.start", "eventId", eventId)

	// Fetch event to enumerate races
	events, err := s.Client.FetchEvent(eventId)
	if err != nil {
		return FullSummary{EventId: eventId}, fmt.Errorf("fetch event: %w", err)
	}
	if len(events) == 0 {
		return FullSummary{EventId: eventId}, fmt.Errorf("event not found: %s", eventId)
	}
	e := events[0]

	// 1) Snapshot core entities
	if err := s.Snapshot(eventId); err != nil {
		return FullSummary{EventId: eventId}, fmt.Errorf("snapshot: %w", err)
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
	cnt, err := s.IngestResults(eventId)
	if err != nil {
		return FullSummary{
			EventId:        eventId,
			RacesProcessed: racesProcessed,
			RacesSucceeded: racesSucceeded,
			RacesFailed:    racesFailed,
		}, fmt.Errorf("results: %w", err)
	}

	// Count of results is not known without extra query; report 0 as placeholder
	summary := FullSummary{
		Ok:              true,
		EventId:         eventId,
		RacesProcessed:  racesProcessed,
		RacesSucceeded:  racesSucceeded,
		RacesFailed:     racesFailed,
		ResultsIngested: cnt,
	}
	slog.Info("ingest.full.done", "eventId", eventId, "processed", racesProcessed, "ok", racesSucceeded, "failed", racesFailed)
	return summary, nil
}

// FullAuto fetches the eventId automatically and then performs a full ingestion
func (s *Service) FullAuto() (FullSummary, error) {
	slog.Info("ingest.fullAuto.start")

	// Fetch eventId using the same method as frontend
	eventId, err := s.Client.FetchEventId()
	if err != nil {
		return FullSummary{}, fmt.Errorf("fetch eventId: %w", err)
	}

	slog.Info("ingest.fullAuto.eventId", "eventId", eventId)

	// Perform full ingestion with the fetched eventId
	summary, err := s.Full(eventId)
	if err != nil {
		return summary, err
	}

	// After successful full ingestion, set this event as current and all others as not current
	if err := s.setEventAsCurrent(eventId); err != nil {
		slog.Warn("ingest.fullAuto.setEventAsCurrent.failed", "eventId", eventId, "err", err)
		// Don't fail the entire operation if setting current status fails
		// The ingestion was successful, this is just a metadata update
	}

	return summary, nil
}

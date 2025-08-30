package ingest

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/pocketbase/dbx"
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

// Snapshot ingests Event, Pilots, Channels, Rounds for an eventSourceId
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) Snapshot(eventSourceId string) error {
	slog.Debug("ingest.snapshot.start", "eventSourceId", eventSourceId)
	// Fetch
	events, err := s.Client.FetchEvent(eventSourceId)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		return fmt.Errorf("event not found: %s", eventSourceId)
	}

	pilots, err := s.Client.FetchPilots(eventSourceId)
	if err != nil {
		return err
	}
	channels, err := s.Client.FetchChannels()
	if err != nil {
		return err
	}
	rounds, err := s.Client.FetchRounds(eventSourceId)
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

	slog.Info("ingest.snapshot.done", "eventSourceId", eventSourceId, "pilots", len(pilots), "channels", len(channels), "rounds", len(rounds))
	return nil
}

// IngestEventMeta fetches and upserts the core Event record for an eventSourceId
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) IngestEventMeta(eventSourceId string) error {
	slog.Debug("ingest.event.start", "eventSourceId", eventSourceId)
	events, err := s.Client.FetchEvent(eventSourceId)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		return fmt.Errorf("event not found: %s", eventSourceId)
	}
	e := events[0]
	return s.IngestEventMetaFromData(e)
}

// IngestEventMetaFromData upserts the core Event record using pre-fetched event data
func (s *Service) IngestEventMetaFromData(e RaceEvent) error {
	eventSourceId := string(e.ID)
	slog.Debug("ingest.event.start", "eventSourceId", eventSourceId)
	_, err := s.Upserter.Upsert("events", eventSourceId, map[string]any{
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
	slog.Info("ingest.event.done", "eventSourceId", eventSourceId)
	return nil
}

// IngestPilots fetches and upserts pilots for the eventSourceId
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) IngestPilots(eventSourceId string) error {
	slog.Debug("ingest.pilots.start", "eventSourceId", eventSourceId)
	eventPBID, err := s.Upserter.GetExistingId("events", eventSourceId)
	if err != nil {
		return err
	}
	pilots, err := s.Client.FetchPilots(eventSourceId)
	if err != nil {
		return err
	}
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
	slog.Info("ingest.pilots.done", "eventSourceId", eventSourceId, "pilots", len(pilots))
	return nil
}

// IngestChannels fetches and upserts only the channels referenced by the event
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) IngestChannels(eventSourceId string) error {
	slog.Debug("ingest.channels.start", "eventSourceId", eventSourceId)
	eventPBID, err := s.Upserter.GetExistingId("events", eventSourceId)
	if err != nil {
		return err
	}
	events, err := s.Client.FetchEvent(eventSourceId)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		return fmt.Errorf("event not found: %s", eventSourceId)
	}
	e := events[0]
	channels, err := s.Client.FetchChannels()
	if err != nil {
		return err
	}
	// Build allowed set and color/display overrides
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
	count := 0
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
		count++
	}
	slog.Info("ingest.channels.done", "eventSourceId", eventSourceId, "channels", count)
	return nil
}

// IngestRounds fetches and upserts rounds for the eventSourceId
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) IngestRounds(eventSourceId string) error {
	slog.Debug("ingest.rounds.start", "eventSourceId", eventSourceId)
	eventPBID, err := s.Upserter.GetExistingId("events", eventSourceId)
	if err != nil {
		return err
	}
	rounds, err := s.Client.FetchRounds(eventSourceId)
	if err != nil {
		return err
	}
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
	slog.Info("ingest.rounds.done", "eventSourceId", eventSourceId, "rounds", len(rounds))
	return nil
}

// IngestPilotChannels fetches and upserts pilotChannels for a race, cleaning up any stale entries
// eventSourceId: The external system's event identifier (not PocketBase ID)
// raceId: The external system's race identifier (not PocketBase ID)
// racePBID: PocketBase ID of the race
// eventPBID: PocketBase ID of the event
// pilotChannels: Array of pilot channels from the race data
func (s *Service) IngestPilotChannels(u *Upserter, eventSourceId, raceId, racePBID, eventPBID string, pilotChannels []struct {
    ID      Guid
    Pilot   Guid
    Channel Guid
}) error {
	slog.Debug("ingest.pilotChannels.start", "eventSourceId", eventSourceId, "raceId", raceId, "count", len(pilotChannels))

	// First, get all existing pilotChannels for this race to identify stale ones
    collection, err := u.App.FindCollectionByNameOrId("pilotChannels")
	if err != nil {
		return fmt.Errorf("find pilotChannels collection: %w", err)
	}

    existingPilotChannels, err := u.App.FindRecordsByFilter(collection.Name, "race = {:raceId}", "", 0, 0, dbx.Params{
        "raceId": racePBID,
    })
	if err != nil {
		return fmt.Errorf("find existing pilotChannels for race: %w", err)
	}

	// Create a map of valid pilotChannel IDs from incoming data
	validPilotChannelIDs := make(map[string]bool)
	for _, pc := range pilotChannels {
		validPilotChannelIDs[string(pc.ID)] = true
	}

	// Delete pilotChannels that are no longer present
	deletedCount := 0
	for _, existingPC := range existingPilotChannels {
		sourceId := existingPC.GetString("sourceId")
		if sourceId != "" && !validPilotChannelIDs[sourceId] {
            if err := u.App.Delete(existingPC); err != nil {
                return fmt.Errorf("delete stale pilotChannel %s: %w", existingPC.Id, err)
            }
            deletedCount++
        }
    }
	if deletedCount > 0 {
		slog.Info("ingest.pilotChannels.cleaned", "raceId", raceId, "deleted", deletedCount)
	}

	// Upsert valid pilotChannels
	for _, pc := range pilotChannels {
		// Get existing pilot and channel PB ids (should already exist from snapshot)
        pilotPBID, err := u.GetExistingId("pilots", string(pc.Pilot))
        if err != nil {
            return err
        }
        channelPBID, err := u.GetExistingId("channels", string(pc.Channel))
        if err != nil {
            return err
        }
        if _, err := u.Upsert("pilotChannels", string(pc.ID), map[string]any{
            "pilot":   pilotPBID,
            "channel": channelPBID,
            "race":    racePBID,
            "event":   eventPBID,
        }); err != nil {
            return err
        }
    }

	slog.Info("ingest.pilotChannels.done", "eventSourceId", eventSourceId, "raceId", raceId, "count", len(pilotChannels))
	return nil
}

// IngestRace fetches and upserts a race and its nested entities
// eventSourceId: The external system's event identifier (not PocketBase ID)
// raceId: The external system's race identifier (not PocketBase ID)
func (s *Service) IngestRace(eventSourceId, raceId string) error {
    slog.Debug("ingest.race.start", "eventSourceId", eventSourceId, "raceId", raceId)

    // Fetch race payload outside the transaction to avoid holding locks during network I/O
    rf, err := s.Client.FetchRace(eventSourceId, raceId)
    if err != nil {
        return err
    }
    if len(rf) == 0 {
        return fmt.Errorf("race not found: %s", raceId)
    }
    r := rf[0]

    // Execute all DB operations in a single transaction
    if err := s.Upserter.App.RunInTransaction(func(txApp core.App) error {
        // Use the transactional app for all DB operations
        u := NewUpserter(txApp)

        // Resolve event PB id within the transaction
        eventPBID, err := u.GetExistingId("events", eventSourceId)
        if err != nil {
            return err
        }

        // Resolve round PB id within the transaction
        roundPBID, err := u.GetExistingId("rounds", string(r.Round))
        if err != nil {
            return err
        }

        // Determine if this is a new race (by sourceId) to decide if we should precompute raceOrder
        existingRaceId, err := u.findExistingId("races", string(r.ID))
        if err != nil {
            return err
        }

        // Build race fields
        raceFields := map[string]any{
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
        }

        // Precompute raceOrder only for new valid races to avoid emitting a second realtime event
        if existingRaceId == "" {
            if r.Valid {
                if newOrder, err := ComputeRaceOrderForNew(txApp, eventPBID, roundPBID, r.RaceNumber); err == nil {
                    raceFields["raceOrder"] = newOrder
                } else {
                    return err
                }
            } else {
                // invalid races should be explicitly set to 0
                raceFields["raceOrder"] = 0
            }
        }

        // Upsert race
        racePBID, err := u.Upsert("races", string(r.ID), raceFields)
        if err != nil {
            return err
        }

        // Ingest pilotChannels for this race using the transactional upserter
        if err := s.IngestPilotChannels(u, eventSourceId, raceId, racePBID, eventPBID, r.PilotChannels); err != nil {
            return err
        }

        // Detections
        detectionPBIDMap := make(map[string]string) // sourceId -> PB ID
        for _, d := range r.Detections {
            pilotPBID, err := u.GetExistingId("pilots", string(d.Pilot))
            if err != nil {
                return err
            }
            channelPBID, err := u.GetExistingId("channels", string(d.Channel))
            if err != nil {
                return err
            }
            detectionPBID, err := u.Upsert("detections", string(d.ID), map[string]any{
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
            })
            if err != nil {
                return err
            }
            detectionPBIDMap[string(d.ID)] = detectionPBID
        }

        // Laps
        for _, l := range r.Laps {
            // Get detection PB id from our map if the lap has a detection reference
            var detectionPBID string
            if l.Detection != "" {
                if pbID, exists := detectionPBIDMap[string(l.Detection)]; exists {
                    detectionPBID = pbID
                } else {
                    return fmt.Errorf("lap references detection %s that was not found in race", l.Detection)
                }
            }

            if _, err := u.Upsert("laps", string(l.ID), map[string]any{
                "lapNumber":     l.LapNumber,
                "lengthSeconds": l.LengthSeconds,
                "startTime":     l.StartTime,
                "endTime":       l.EndTime,
                "detection":     detectionPBID,
                "race":          racePBID,
                "event":         eventPBID,
            }); err != nil {
                return err
            }
        }

        // GamePoints
        for _, gp := range r.GamePoints {
            pilotPBID, err := u.GetExistingId("pilots", string(gp.Pilot))
            if err != nil {
                return err
            }
            channelPBID, err := u.GetExistingId("channels", string(gp.Channel))
            if err != nil {
                return err
            }
            if _, err := u.Upsert("gamePoints", string(gp.ID), map[string]any{
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

        // Recalculate race order within the same transaction
        if err := RecalculateRaceOrder(txApp, eventPBID); err != nil {
            return err
        }

        return nil
    }); err != nil {
        return err
    }

    slog.Info("ingest.race.done", "eventSourceId", eventSourceId, "raceId", raceId, "detections", len(r.Detections), "laps", len(r.Laps), "gamePoints", len(r.GamePoints))
    return nil
}

// IngestResults fetches aggregated results for the event and upserts them
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) IngestResults(eventSourceId string) (int, error) {
	slog.Debug("ingest.results.start", "eventSourceId", eventSourceId)
	// Get existing event PB id (event should already exist from snapshot)
	eventPBID, err := s.Upserter.GetExistingId("events", eventSourceId)
	if err != nil {
		return 0, err
	}

	// Fetch results
	res, err := s.Client.FetchResults(eventSourceId)
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
	slog.Info("ingest.results.done", "eventSourceId", eventSourceId, "results", len(res))
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
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) setEventAsCurrent(eventSourceId string) error {
	slog.Debug("ingest.setEventAsCurrent.start", "eventSourceId", eventSourceId)

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
		isCurrent := event.GetString("sourceId") == eventSourceId
		event.Set("isCurrent", isCurrent)
		if err := s.Upserter.App.Save(event); err != nil {
			return fmt.Errorf("save event %s with isCurrent=%t: %w", event.Id, isCurrent, err)
		}
	}

	slog.Info("ingest.setEventAsCurrent.done", "eventSourceId", eventSourceId, "totalEvents", len(allEvents))
	return nil
}

// Full orchestrates a full ingestion for an event: snapshot -> all races -> results
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) Full(eventSourceId string) (FullSummary, error) {
	slog.Debug("ingest.full.start", "eventSourceId", eventSourceId)

	// Fetch event to enumerate races
	events, err := s.Client.FetchEvent(eventSourceId)
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

	// Count of results is not known without extra query; report 0 as placeholder
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
	eventSourceId, err := s.Client.FetchEventSourceId()
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
	if err := s.setEventAsCurrent(eventSourceId); err != nil {
		slog.Warn("ingest.fullAuto.setEventAsCurrent.failed", "eventSourceId", eventSourceId, "err", err)
		// Don't fail the entire operation if setting current status fails
		// The ingestion was successful, this is just a metadata update
	}

	return summary, nil
}

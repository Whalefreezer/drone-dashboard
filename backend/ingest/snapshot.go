package ingest

import (
	"fmt"
	"log/slog"
)

// Snapshot ingests Event, Pilots, Channels, Rounds for an eventSourceId
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) Snapshot(eventSourceId string) error {
	slog.Debug("ingest.snapshot.start", "eventSourceId", eventSourceId)
	// Fetch
	events, err := s.Source.FetchEvent(eventSourceId)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		return fmt.Errorf("event not found: %s", eventSourceId)
	}

	pilots, err := s.Source.FetchPilots(eventSourceId)
	if err != nil {
		return err
	}
	channels, err := s.Source.FetchChannels()
	if err != nil {
		return err
	}
	rounds, err := s.Source.FetchRounds(eventSourceId)
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

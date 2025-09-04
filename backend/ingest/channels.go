package ingest

import (
	"fmt"
	"log/slog"
)

// IngestChannels fetches and upserts only the channels referenced by the event
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) IngestChannels(eventSourceId string) error {
	slog.Debug("ingest.channels.start", "eventSourceId", eventSourceId)
	eventPBID, err := s.Upserter.GetExistingId("events", eventSourceId)
	if err != nil {
		return err
	}
	events, err := s.Source.FetchEvent(eventSourceId)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		return fmt.Errorf("event not found: %s", eventSourceId)
	}
	e := events[0]
	channels, err := s.Source.FetchChannels()
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
	slog.Debug("ingest.channels.done", "channels", count)
	return nil
}

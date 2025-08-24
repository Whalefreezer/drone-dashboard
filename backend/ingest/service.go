package ingest

import "github.com/pocketbase/pocketbase/core"

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
	// Fetch minimal data; upsert only events for Phase 2 wiring
	events, err := s.Client.FetchEvent(eventId)
	if err != nil {
		return err
	}
	if len(events) > 0 {
		_, err = s.Upserter.Upsert("events", string(events[0].ID), map[string]any{
			"name":      events[0].Name,
			"eventType": events[0].EventType,
			"start":     events[0].Start,
			"end":       events[0].End,
		})
		if err != nil {
			return err
		}
	}
	return nil
}

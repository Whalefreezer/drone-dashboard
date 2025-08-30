package ingest

import (
    "fmt"
    "log/slog"
)

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


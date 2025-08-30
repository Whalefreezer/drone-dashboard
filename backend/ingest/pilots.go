package ingest

import (
    "log/slog"
)

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


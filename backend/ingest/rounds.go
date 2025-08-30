package ingest

import (
    "log/slog"
)

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


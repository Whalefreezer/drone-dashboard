package ingest

import (
    "log/slog"
)

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
    res, err := s.Source.FetchResults(eventSourceId)
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

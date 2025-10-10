package ingest

import (
	"log/slog"

	"github.com/pocketbase/pocketbase/core"
)

// IngestPilots fetches and upserts pilots for the eventSourceId
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) IngestPilots(eventSourceId string) error {
	slog.Debug("ingest.pilots.start", "eventSourceId", eventSourceId)
	eventPBID, err := s.Upserter.GetExistingId("events", eventSourceId)
	if err != nil {
		return err
	}
	pilots, err := s.Source.FetchPilots(eventSourceId)
	if err != nil {
		return err
	}

	// Track pilot IDs for this event to prune orphans later
	activePilotIDs := make(map[string]bool)

	for _, p := range pilots {
		pilotPBID, err := s.Upserter.Upsert("pilots", string(p.ID), map[string]any{
			"name":          p.Name,
			"firstName":     p.FirstName,
			"lastName":      p.LastName,
			"discordId":     p.DiscordID,
			"practicePilot": p.PracticePilot,
		})
		if err != nil {
			return err
		}

		activePilotIDs[pilotPBID] = true

		// Create/update event_pilots join record (no sourceId, just relation)
		// We use a filter-based check to avoid duplicates
		existing, err := s.Upserter.App.FindFirstRecordByFilter(
			"event_pilots",
			"event = {:event} && pilot = {:pilot}",
			map[string]any{
				"event": eventPBID,
				"pilot": pilotPBID,
			},
		)
		if err == nil && existing != nil {
			// Already exists, skip
			continue
		}

		// Create new event_pilots record
		collection, err := s.Upserter.App.FindCollectionByNameOrId("event_pilots")
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Set("event", eventPBID)
		record.Set("pilot", pilotPBID)
		if err := s.Upserter.App.Save(record); err != nil {
			return err
		}
	}

	// Prune orphaned event_pilots records for this event
	allEventPilots, err := s.Upserter.App.FindRecordsByFilter(
		"event_pilots",
		"event = {:event}",
		"",
		0,
		0,
		map[string]any{"event": eventPBID},
	)
	if err != nil {
		slog.Warn("ingest.pilots.prune_failed", "error", err)
	} else {
		pruned := 0
		for _, ep := range allEventPilots {
			pilotID := ep.GetString("pilot")
			if !activePilotIDs[pilotID] {
				if err := s.Upserter.App.Delete(ep); err != nil {
					slog.Warn("ingest.pilots.prune_record_failed", "id", ep.Id, "error", err)
				} else {
					pruned++
				}
			}
		}
		if pruned > 0 {
			slog.Debug("ingest.pilots.pruned", "count", pruned)
		}
	}

	slog.Debug("ingest.pilots.done", "eventSourceId", eventSourceId, "pilots", len(pilots))
	return nil
}

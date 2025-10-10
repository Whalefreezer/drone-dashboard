package ingest

import (
	"fmt"
	"log/slog"

	"github.com/pocketbase/dbx"
)

// IngestEventMeta fetches and upserts the core Event record for an eventSourceId
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) IngestEventMeta(eventSourceId string) error {
	slog.Debug("ingest.event.start", "eventSourceId", eventSourceId)
	events, err := s.Source.FetchEvent(eventSourceId)
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
	slog.Debug("ingest.event.done", "eventSourceId", eventSourceId)
	return nil
}

// SetEventAsCurrent sets the specified event as current and flips others only if needed.
// Uses a single SQL query to determine which records require updates and saves only those.
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (s *Service) SetEventAsCurrent(eventSourceId string) error {
	slog.Debug("ingest.setEventAsCurrent.start", "eventSourceId", eventSourceId)

	// Select only events that need their isCurrent flag changed, along with the new value
	query := `
        SELECT id,
               CASE WHEN sourceId = {:sid} THEN 1 ELSE 0 END AS new_is_current
        FROM events
        WHERE (isCurrent = 1 AND sourceId != {:sid})
           OR (isCurrent = 0 AND sourceId = {:sid})
    `

	type row struct {
		ID           string `db:"id"`
		NewIsCurrent int    `db:"new_is_current"`
	}

	var rows []row
	if err := s.Upserter.App.DB().NewQuery(query).Bind(dbx.Params{"sid": eventSourceId}).All(&rows); err != nil {
		return fmt.Errorf("query events to flip isCurrent: %w", err)
	}

	changed := 0
	for _, r := range rows {
		rec, err := s.Upserter.App.FindRecordById("events", r.ID)
		if err != nil || rec == nil {
			slog.Warn("ingest.setEventAsCurrent.find.error", "id", r.ID, "err", err)
			continue
		}
		rec.Set("isCurrent", r.NewIsCurrent == 1)
		if err := s.Upserter.App.Save(rec); err != nil {
			return fmt.Errorf("save event %s: %w", r.ID, err)
		}
		changed++
	}

	slog.Debug("ingest.setEventAsCurrent.done", "eventSourceId", eventSourceId, "changed", changed)
	return nil
}

// UpdateRemovedPilots marks pilots as removed in event_pilots based on RemovedPilots list
func (s *Service) UpdateRemovedPilots(e RaceEvent) error {
	eventSourceId := string(e.ID)
	slog.Debug("ingest.updateRemovedPilots.start", "eventSourceId", eventSourceId, "removedCount", len(e.RemovedPilots))

	eventPBID, err := s.Upserter.GetExistingId("events", eventSourceId)
	if err != nil {
		return err
	}

	// Build a set of removed pilot source IDs for quick lookup
	removedPilotSet := make(map[string]bool)
	for _, pilotSourceID := range e.RemovedPilots {
		removedPilotSet[pilotSourceID] = true
	}

	// Get all pilots to map sourceId -> PBID
	pilotsRecords, err := s.Upserter.App.FindRecordsByFilter("pilots", "", "", 0, 0)
	if err != nil {
		return fmt.Errorf("fetch pilots: %w", err)
	}

	pilotSourceIDToPBID := make(map[string]string)
	for _, pilot := range pilotsRecords {
		sourceID := pilot.GetString("sourceId")
		if sourceID != "" {
			pilotSourceIDToPBID[sourceID] = pilot.Id
		}
	}

	// Get all event_pilots for this event
	eventPilots, err := s.Upserter.App.FindRecordsByFilter(
		"event_pilots",
		"event = {:event}",
		"",
		0,
		0,
		map[string]any{"event": eventPBID},
	)
	if err != nil {
		return fmt.Errorf("fetch event_pilots: %w", err)
	}

	updated := 0
	for _, ep := range eventPilots {
		pilotPBID := ep.GetString("pilot")

		// Find the pilot's sourceId
		pilotSourceID := ""
		for sourceID, pbID := range pilotSourceIDToPBID {
			if pbID == pilotPBID {
				pilotSourceID = sourceID
				break
			}
		}

		// Determine if this pilot should be marked as removed
		shouldBeRemoved := removedPilotSet[pilotSourceID]
		currentlyRemoved := ep.GetBool("removed")

		if shouldBeRemoved != currentlyRemoved {
			ep.Set("removed", shouldBeRemoved)
			if err := s.Upserter.App.Save(ep); err != nil {
				slog.Warn("ingest.updateRemovedPilots.save_failed", "id", ep.Id, "error", err)
			} else {
				updated++
			}
		}
	}

	slog.Debug("ingest.updateRemovedPilots.done", "eventSourceId", eventSourceId, "updated", updated)
	return nil
}

package ingest

import (
	"fmt"
	"log/slog"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

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
	slog.Debug("ingest.pilotChannels.start", "raceId", raceId, "count", len(pilotChannels))

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

	slog.Info("ingest.pilotChannels.done", "raceId", raceId, "count", len(pilotChannels))
	return nil
}

// IngestRace fetches and upserts a race and its nested entities
// eventSourceId: The external system's event identifier (not PocketBase ID)
// raceId: The external system's race identifier (not PocketBase ID)
func (s *Service) IngestRace(eventSourceId, raceId string) error {
	slog.Debug("ingest.race.start", "raceId", raceId)

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

		// Set raceOrder to 0 for invalid races (both new and existing)
		if !r.Valid {
			raceFields["raceOrder"] = 0
		} else if existingRaceId == "" {
			// Precompute raceOrder only for new valid races to avoid emitting a second realtime event
			if newOrder, err := ComputeRaceOrderForNew(txApp, eventPBID, roundPBID, r.RaceNumber); err == nil {
				raceFields["raceOrder"] = newOrder
			} else {
				return err
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

	slog.Info("ingest.race.done", "raceId", raceId, "detections", len(r.Detections), "laps", len(r.Laps), "gamePoints", len(r.GamePoints))
	return nil
}

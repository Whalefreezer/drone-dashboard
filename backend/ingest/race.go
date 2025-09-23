package ingest

import (
	"fmt"
	"log/slog"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func cleanupStaleRaceRecords(app core.App, collectionName, racePBID string, validIDs map[string]struct{}) (int, error) {
	col, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return 0, fmt.Errorf("find %s collection: %w", collectionName, err)
	}

	records, err := app.FindRecordsByFilter(col.Name, "source = {:source} && race = {:raceId}", "", 0, 0, dbx.Params{
		"source": sourceName,
		"raceId": racePBID,
	})
	if err != nil {
		return 0, fmt.Errorf("find existing %s for race: %w", collectionName, err)
	}

	deleted := 0
	for _, rec := range records {
		sourceId := rec.GetString("sourceId")
		if sourceId == "" {
			continue
		}
		if _, ok := validIDs[sourceId]; ok {
			continue
		}
		if err := app.Delete(rec); err != nil {
			return deleted, fmt.Errorf("delete stale %s %s: %w", collectionName, rec.Id, err)
		}
		deleted++
	}

	return deleted, nil
}

func cleanupRaceCollection(app core.App, collection, raceId, racePBID string, validIDs map[string]struct{}) error {
	deleted, err := cleanupStaleRaceRecords(app, collection, racePBID, validIDs)
	if err != nil {
		return err
	}
	if deleted > 0 {
		slog.Debug("ingest.race.cleaned", "raceId", raceId, "collection", collection, "deleted", deleted)
	}
	return nil
}

func detectionIDSet(detections []Detection) map[string]struct{} {
	out := make(map[string]struct{}, len(detections))
	for _, item := range detections {
		out[string(item.ID)] = struct{}{}
	}
	return out
}

func lapIDSet(laps []Lap) map[string]struct{} {
	out := make(map[string]struct{}, len(laps))
	for _, item := range laps {
		out[string(item.ID)] = struct{}{}
	}
	return out
}

func gamePointIDSet(points []GamePoint) map[string]struct{} {
	out := make(map[string]struct{}, len(points))
	for _, item := range points {
		out[string(item.ID)] = struct{}{}
	}
	return out
}

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
		slog.Debug("ingest.pilotChannels.cleaned", "raceId", raceId, "deleted", deletedCount)
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

	slog.Debug("ingest.pilotChannels.done", "raceId", raceId, "count", len(pilotChannels))
	return nil
}

// IngestRace fetches and upserts a race and its nested entities
// eventSourceId: The external system's event identifier (not PocketBase ID)
// raceId: The external system's race identifier (not PocketBase ID)
func (s *Service) IngestRace(eventSourceId, raceId string) error {
	slog.Debug("ingest.race.start", "raceId", raceId)

	// Fetch race payload outside the transaction to avoid holding locks during network I/O
	rf, err := s.Source.FetchRace(eventSourceId, raceId)
	if err != nil {
		return err
	}
	if len(rf) == 0 {
		return fmt.Errorf("race not found: %s", raceId)
	}
	r := rf[0]

	// Execute all DB operations in a single transaction
	if err := s.Upserter.App.RunInTransaction(func(txApp core.App) error {
		return s.ingestRaceTransaction(txApp, eventSourceId, raceId, r)
	}); err != nil {
		return err
	}

	slog.Debug("ingest.race.done", "raceId", raceId, "detections", len(r.Detections), "laps", len(r.Laps), "gamePoints", len(r.GamePoints))
	return nil
}

func (s *Service) ingestRaceTransaction(txApp core.App, eventSourceId, raceId string, payload Race) error {
	u := NewUpserter(txApp)

	eventPBID, err := u.GetExistingId("events", eventSourceId)
	if err != nil {
		return err
	}

	roundPBID, err := u.GetExistingId("rounds", string(payload.Round))
	if err != nil {
		return err
	}

	racePBID, err := s.upsertRaceRecord(txApp, u, payload, eventPBID, roundPBID)
	if err != nil {
		return err
	}

	if err := s.IngestPilotChannels(u, eventSourceId, raceId, racePBID, eventPBID, payload.PilotChannels); err != nil {
		return err
	}

	if err := cleanupRaceCollection(txApp, "detections", raceId, racePBID, detectionIDSet(payload.Detections)); err != nil {
		return err
	}
	if err := cleanupRaceCollection(txApp, "laps", raceId, racePBID, lapIDSet(payload.Laps)); err != nil {
		return err
	}
	if err := cleanupRaceCollection(txApp, "gamePoints", raceId, racePBID, gamePointIDSet(payload.GamePoints)); err != nil {
		return err
	}

	detectionPBIDMap, err := s.upsertDetections(u, payload, racePBID, eventPBID)
	if err != nil {
		return err
	}

	if err := s.upsertLaps(u, payload, racePBID, eventPBID, detectionPBIDMap); err != nil {
		return err
	}

	if err := s.upsertGamePoints(u, payload, racePBID, eventPBID); err != nil {
		return err
	}

	return RecalculateRaceOrder(txApp, eventPBID)
}

func (s *Service) upsertRaceRecord(txApp core.App, u *Upserter, race Race, eventPBID, roundPBID string) (string, error) {
	existingRaceId, err := u.findExistingId("races", string(race.ID))
	if err != nil {
		return "", err
	}

	raceFields := map[string]any{
		"raceNumber":                  race.RaceNumber,
		"start":                       race.Start,
		"end":                         race.End,
		"totalPausedTime":             race.TotalPausedTime,
		"primaryTimingSystemLocation": race.PrimaryTimingSystemLocation,
		"valid":                       race.Valid,
		"bracket":                     race.Bracket,
		"targetLaps":                  race.TargetLaps,
		"event":                       eventPBID,
		"round":                       roundPBID,
	}

	if !race.Valid {
		raceFields["raceOrder"] = 0
	} else if existingRaceId == "" {
		newOrder, err := ComputeRaceOrderForNew(txApp, eventPBID, roundPBID, race.RaceNumber)
		if err != nil {
			return "", err
		}
		raceFields["raceOrder"] = newOrder
	}

	return u.Upsert("races", string(race.ID), raceFields)
}

func (s *Service) upsertDetections(u *Upserter, race Race, racePBID, eventPBID string) (map[string]string, error) {
	result := make(map[string]string, len(race.Detections))
	for _, d := range race.Detections {
		pilotPBID, err := u.GetExistingId("pilots", string(d.Pilot))
		if err != nil {
			return nil, err
		}
		channelPBID, err := u.GetExistingId("channels", string(d.Channel))
		if err != nil {
			return nil, err
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
			return nil, err
		}
		result[string(d.ID)] = detectionPBID
	}
	return result, nil
}

func (s *Service) upsertLaps(u *Upserter, race Race, racePBID, eventPBID string, detectionPBIDMap map[string]string) error {
	for _, l := range race.Laps {
		var detectionPBID string
		if l.Detection != "" {
			if pbID, ok := detectionPBIDMap[string(l.Detection)]; ok {
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
	return nil
}

func (s *Service) upsertGamePoints(u *Upserter, race Race, racePBID, eventPBID string) error {
	for _, gp := range race.GamePoints {
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
	return nil
}

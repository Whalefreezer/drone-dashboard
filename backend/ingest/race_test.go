package ingest

import (
	"fmt"
	"sort"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "drone-dashboard/migrations"
)

type fakeRaceSource struct {
	payloads []RaceFile
	calls    int
}

func (f *fakeRaceSource) FetchRace(eventSourceId, raceId string) (RaceFile, error) {
	if f.calls >= len(f.payloads) {
		return RaceFile{}, fmt.Errorf("unexpected FetchRace call %d", f.calls)
	}
	rf := f.payloads[f.calls]
	f.calls++
	return rf, nil
}

func (f *fakeRaceSource) FetchEvent(eventSourceId string) (EventFile, error) { return EventFile{}, nil }

func (f *fakeRaceSource) FetchPilots(eventSourceId string) (PilotsFile, error) {
	return PilotsFile{}, nil
}

func (f *fakeRaceSource) FetchChannels() (ChannelsFile, error) { return ChannelsFile{}, nil }

func (f *fakeRaceSource) FetchRounds(eventSourceId string) (RoundsFile, error) {
	return RoundsFile{}, nil
}

func (f *fakeRaceSource) FetchResults(eventSourceId string) (ResultsFile, error) {
	return ResultsFile{}, nil
}

func (f *fakeRaceSource) FetchEventSourceId() (string, error) { return "", nil }

func TestIngestRaceCleansStaleRecords(t *testing.T) {
	t.Helper()

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("new test app: %v", err)
	}
	t.Cleanup(app.Cleanup)

	fake := &fakeRaceSource{}
	service := NewServiceWithSource(app, fake)

	const (
		eventSourceID   = "event-1"
		roundSourceID   = "round-1"
		raceSourceID    = "race-1"
		pilotSourceID   = "pilot-1"
		channelSourceID = "channel-1"
		detectKeepID    = "det-keep"
		detectDropID    = "det-drop"
		lapKeepID       = "lap-keep"
		lapDropID       = "lap-drop"
		gamePointKeepID = "gp-keep"
		gamePointDropID = "gp-drop"
		pilotChannelID  = "pc-1"
	)

	eventPBID, err := service.Upserter.Upsert("events", eventSourceID, map[string]any{
		"name": "Test Event",
	})
	if err != nil {
		t.Fatalf("seed event: %v", err)
	}

	roundPBID, err := service.Upserter.Upsert("rounds", roundSourceID, map[string]any{
		"event": eventPBID,
		"name":  "Round 1",
		"order": 1,
	})
	if err != nil {
		t.Fatalf("seed round: %v", err)
	}
	if roundPBID == "" {
		t.Fatalf("round not created")
	}

	if _, err := service.Upserter.Upsert("pilots", pilotSourceID, map[string]any{
		"name":  "Pilot 1",
		"event": eventPBID,
	}); err != nil {
		t.Fatalf("seed pilot: %v", err)
	}

	if _, err := service.Upserter.Upsert("channels", channelSourceID, map[string]any{
		"number":      1,
		"band":        "A",
		"displayName": "Ch 1",
		"event":       eventPBID,
	}); err != nil {
		t.Fatalf("seed channel: %v", err)
	}

	fake.payloads = []RaceFile{
		{
			{
				ID:                          Guid(raceSourceID),
				Event:                       Guid(eventSourceID),
				Round:                       Guid(roundSourceID),
				RaceNumber:                  1,
				Valid:                       true,
				Start:                       "2025-01-01T00:00:00Z",
				End:                         "2025-01-01T00:10:00Z",
				TotalPausedTime:             "00:00:00",
				PrimaryTimingSystemLocation: "line",
				TargetLaps:                  2,
				PilotChannels: []struct {
					ID      Guid
					Pilot   Guid
					Channel Guid
				}{
					{ID: Guid(pilotChannelID), Pilot: Guid(pilotSourceID), Channel: Guid(channelSourceID)},
				},
				Detections: []Detection{
					{
						ID:                Guid(detectDropID),
						TimingSystemIndex: 1,
						Channel:           Guid(channelSourceID),
						Time:              "2025-01-01T00:01:00Z",
						Peak:              10,
						TimingSystemType:  "base",
						Pilot:             Guid(pilotSourceID),
						LapNumber:         1,
						Valid:             true,
						ValidityType:      "valid",
						IsLapEnd:          true,
						RaceSector:        1,
						IsHoleshot:        false,
					},
					{
						ID:                Guid(detectKeepID),
						TimingSystemIndex: 1,
						Channel:           Guid(channelSourceID),
						Time:              "2025-01-01T00:02:00Z",
						Peak:              12,
						TimingSystemType:  "base",
						Pilot:             Guid(pilotSourceID),
						LapNumber:         2,
						Valid:             true,
						ValidityType:      "valid",
						IsLapEnd:          true,
						RaceSector:        1,
						IsHoleshot:        false,
					},
				},
				Laps: []Lap{
					{
						ID:            Guid(lapDropID),
						Detection:     Guid(detectDropID),
						LengthSeconds: 31.5,
						LapNumber:     1,
						StartTime:     "2025-01-01T00:01:00Z",
						EndTime:       "2025-01-01T00:01:31Z",
					},
					{
						ID:            Guid(lapKeepID),
						Detection:     Guid(detectKeepID),
						LengthSeconds: 29.2,
						LapNumber:     2,
						StartTime:     "2025-01-01T00:02:00Z",
						EndTime:       "2025-01-01T00:02:29Z",
					},
				},
				GamePoints: []GamePoint{
					{ID: Guid(gamePointDropID), Pilot: Guid(pilotSourceID), Channel: Guid(channelSourceID), Valid: true, Time: "2025-01-01T00:03:00Z"},
					{ID: Guid(gamePointKeepID), Pilot: Guid(pilotSourceID), Channel: Guid(channelSourceID), Valid: true, Time: "2025-01-01T00:04:00Z"},
				},
			},
		},
		{
			{
				ID:                          Guid(raceSourceID),
				Event:                       Guid(eventSourceID),
				Round:                       Guid(roundSourceID),
				RaceNumber:                  1,
				Valid:                       true,
				Start:                       "2025-01-01T00:00:00Z",
				End:                         "2025-01-01T00:10:00Z",
				TotalPausedTime:             "00:00:00",
				PrimaryTimingSystemLocation: "line",
				TargetLaps:                  2,
				PilotChannels: []struct {
					ID      Guid
					Pilot   Guid
					Channel Guid
				}{
					{ID: Guid(pilotChannelID), Pilot: Guid(pilotSourceID), Channel: Guid(channelSourceID)},
				},
				Detections: []Detection{
					{
						ID:                Guid(detectKeepID),
						TimingSystemIndex: 1,
						Channel:           Guid(channelSourceID),
						Time:              "2025-01-01T00:02:05Z",
						Peak:              15,
						TimingSystemType:  "base",
						Pilot:             Guid(pilotSourceID),
						LapNumber:         1,
						Valid:             true,
						ValidityType:      "valid",
						IsLapEnd:          true,
						RaceSector:        1,
						IsHoleshot:        false,
					},
				},
				Laps: []Lap{
					{
						ID:            Guid(lapKeepID),
						Detection:     Guid(detectKeepID),
						LengthSeconds: 28.8,
						LapNumber:     1,
						StartTime:     "2025-01-01T00:02:05Z",
						EndTime:       "2025-01-01T00:02:33Z",
					},
				},
				GamePoints: []GamePoint{
					{ID: Guid(gamePointKeepID), Pilot: Guid(pilotSourceID), Channel: Guid(channelSourceID), Valid: true, Time: "2025-01-01T00:04:30Z"},
				},
			},
		},
	}

	if err := service.IngestRace(eventSourceID, raceSourceID); err != nil {
		t.Fatalf("first ingest: %v", err)
	}

	racePBID, err := service.Upserter.findExistingId("races", raceSourceID)
	if err != nil {
		t.Fatalf("lookup race id: %v", err)
	}
	if racePBID == "" {
		t.Fatalf("race not created")
	}

	assertIDs(t, app, "detections", racePBID, detectDropID, detectKeepID)
	assertIDs(t, app, "laps", racePBID, lapDropID, lapKeepID)
	assertIDs(t, app, "gamePoints", racePBID, gamePointDropID, gamePointKeepID)

	if err := service.IngestRace(eventSourceID, raceSourceID); err != nil {
		t.Fatalf("second ingest: %v", err)
	}

	assertIDs(t, app, "detections", racePBID, detectKeepID)
	assertIDs(t, app, "laps", racePBID, lapKeepID)
	assertIDs(t, app, "gamePoints", racePBID, gamePointKeepID)

	keepDetectionPBID, err := service.Upserter.findExistingId("detections", detectKeepID)
	if err != nil {
		t.Fatalf("lookup detection id: %v", err)
	}
	if keepDetectionPBID == "" {
		t.Fatalf("expected detection %s to exist", detectKeepID)
	}

	lapRecord, err := app.FindFirstRecordByFilter("laps", "sourceId = {:sid}", dbx.Params{"sid": lapKeepID})
	if err != nil {
		t.Fatalf("find lap: %v", err)
	}
	if got := lapRecord.GetString("detection"); got != keepDetectionPBID {
		t.Fatalf("lap detection mismatch: got %s want %s", got, keepDetectionPBID)
	}
}

func assertIDs(t *testing.T, app core.App, collection, racePBID string, expected ...string) {
	t.Helper()
	records, err := app.FindRecordsByFilter(collection, "race = {:race}", "", 0, 0, dbx.Params{"race": racePBID})
	if err != nil {
		t.Fatalf("find %s: %v", collection, err)
	}
	got := make([]string, 0, len(records))
	for _, rec := range records {
		got = append(got, rec.GetString("sourceId"))
	}
	sort.Strings(got)
	want := append([]string(nil), expected...)
	sort.Strings(want)
	if len(got) != len(want) {
		t.Fatalf("%s count mismatch: got %d want %d", collection, len(got), len(want))
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("%s mismatch at %d: got %s want %s", collection, i, got[i], want[i])
		}
	}
}

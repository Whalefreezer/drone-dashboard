package importer

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

type collectionsPayload struct {
	Events        []map[string]any `json:"events"`
	Pilots        []map[string]any `json:"pilots"`
	Channels      []map[string]any `json:"channels"`
	Rounds        []map[string]any `json:"rounds"`
	Races         []map[string]any `json:"races"`
	PilotChannels []map[string]any `json:"pilotChannels"`
	Laps          []map[string]any `json:"laps"`
	Detections    []map[string]any `json:"detections"`
	GamePoints    []map[string]any `json:"gamePoints"`
	ClientKV      []map[string]any `json:"client_kv"`
	// Admin collections excluded from snapshots
	IngestTargets  []map[string]any `json:"ingest_targets,omitempty"`
	ServerSettings []map[string]any `json:"server_settings,omitempty"`
}

type Snapshot struct {
	Version        string             `json:"version"`
	SnapshotTime   string             `json:"snapshotTime"`
	CurrentEventId *string            `json:"currentEventId"`
	Collections    collectionsPayload `json:"collections"`
}

// ImportFromFile loads a PocketBase snapshot JSON and imports it into the DB.
// Records are merged by explicit id (update if exists, create if missing).
func ImportFromFile(app core.App, path string) error {
	start := time.Now()
	slog.Info("import.snapshot.start", "path", path)
	b, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read file: %w", err)
	}
	var snap Snapshot
	if err := json.Unmarshal(b, &snap); err != nil {
		return fmt.Errorf("decode json: %w", err)
	}
	if snap.Version == "" || !strings.HasPrefix(snap.Version, "pb-snapshot@") {
		slog.Warn("import.snapshot.version.unexpected", "version", snap.Version)
	}

	counts := map[string]int{}
	// Import in referential order
	if n, err := importCollection(app, "events", snap.Collections.Events); err != nil {
		return err
	} else {
		counts["events"] = n
	}
	if n, err := importCollection(app, "channels", snap.Collections.Channels); err != nil {
		return err
	} else {
		counts["channels"] = n
	}
	if n, err := importCollection(app, "pilots", snap.Collections.Pilots); err != nil {
		return err
	} else {
		counts["pilots"] = n
	}
	if n, err := importCollection(app, "rounds", snap.Collections.Rounds); err != nil {
		return err
	} else {
		counts["rounds"] = n
	}
	if n, err := importCollection(app, "races", snap.Collections.Races); err != nil {
		return err
	} else {
		counts["races"] = n
	}
	if n, err := importCollection(app, "pilotChannels", snap.Collections.PilotChannels); err != nil {
		return err
	} else {
		counts["pilotChannels"] = n
	}
	if n, err := importCollection(app, "detections", snap.Collections.Detections); err != nil {
		return err
	} else {
		counts["detections"] = n
	}
	if n, err := importCollection(app, "laps", snap.Collections.Laps); err != nil {
		return err
	} else {
		counts["laps"] = n
	}
	if n, err := importCollection(app, "gamePoints", snap.Collections.GamePoints); err != nil {
		return err
	} else {
		counts["gamePoints"] = n
	}
	if n, err := importCollection(app, "client_kv", snap.Collections.ClientKV); err != nil {
		return err
	} else {
		counts["client_kv"] = n
	}
	// Import admin collections only if present in snapshot
	if len(snap.Collections.IngestTargets) > 0 {
		if n, err := importCollection(app, "ingest_targets", snap.Collections.IngestTargets); err != nil {
			return err
		} else {
			counts["ingest_targets"] = n
		}
	}
	if len(snap.Collections.ServerSettings) > 0 {
		if n, err := importCollection(app, "server_settings", snap.Collections.ServerSettings); err != nil {
			return err
		} else {
			counts["server_settings"] = n
		}
	}

	// Adjust current event flag if provided
	if snap.CurrentEventId != nil {
		if err := setCurrentEvent(app, *snap.CurrentEventId); err != nil {
			return err
		}
	}

	dur := time.Since(start)
	slog.Info("import.snapshot.done", "counts", counts, "duration", dur.String())
	return nil
}

func importCollection(app core.App, collection string, rows []map[string]any) (int, error) {
	for _, row := range rows {
		idVal, ok := row["id"]
		if !ok {
			return 0, fmt.Errorf("row missing id in %s", collection)
		}
		id := fmt.Sprintf("%v", idVal)
		delete(row, "id")
		if err := saveWithId(app, collection, id, row); err != nil {
			return 0, fmt.Errorf("save %s/%s: %w", collection, id, err)
		}
	}
	return len(rows), nil
}

func saveWithId(app core.App, colName, id string, fields map[string]any) error {
	col, err := app.FindCollectionByNameOrId(colName)
	if err != nil {
		return err
	}
	rec, err := app.FindRecordById(colName, id)
	if err != nil || rec == nil {
		rec = core.NewRecord(col)
		// Try to set id explicitly; prefer dedicated setter if available
		if s, ok := any(rec).(interface{ SetId(string) }); ok {
			s.SetId(id)
		} else {
			rec.Set("id", id)
		}
	}
	for k, v := range fields {
		rec.Set(k, v)
	}
	return app.Save(rec)
}

func setCurrentEvent(app core.App, id string) error {
	// Set exactly one event to current, clear others
	col, err := app.FindCollectionByNameOrId("events")
	if err != nil {
		return err
	}

	// Set target current
	target, err := app.FindRecordById("events", id)
	if err == nil && target != nil {
		target.Set("isCurrent", true)
		if err := app.Save(target); err != nil {
			return err
		}
	}
	// Clear others (best-effort)
	recs, err := app.FindAllRecords("events")
	if err == nil {
		for _, r := range recs {
			if r.Id == id {
				continue
			}
			if r.GetBool("isCurrent") {
				r.Set("isCurrent", false)
				_ = app.Save(r)
			}
		}
	}
	_ = col // silence col unused in older PB versions
	return nil
}

package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Adds collections used by the in-process scheduler:
// - ingest_targets: tracks what to poll, when, and with what cadence
// - server_settings: generic key/value settings for runtime tuning
func init() {
	m.Register(func(app core.App) error {
		// ingest_targets
		ingestTargets := core.NewBaseCollection("ingest_targets")
		evCol, err := app.FindCollectionByNameOrId("events")
		if err != nil {
			return err
		}
		ingestTargets.Fields.Add(
			&core.TextField{Name: "type", Required: true, Max: 32},
			&core.TextField{Name: "sourceId", Required: true, Max: 128},
			&core.RelationField{Name: "event", CollectionId: evCol.Id, MaxSelect: 1},
			&core.NumberField{Name: "intervalMs"},
			&core.NumberField{Name: "nextDueAt"}, // epoch millis
			&core.NumberField{Name: "priority"},
			&core.BoolField{Name: "enabled"},
			&core.NumberField{Name: "lastFetchedAt"},
			&core.TextField{Name: "lastStatus", Max: 255},
		)
		// Unique by (type, sourceId)
		ingestTargets.AddIndex("ux_ingest_targets_key", true, "type, sourceId", "")
		ingestTargets.ListRule = types.Pointer("")
		ingestTargets.ViewRule = types.Pointer("")
		if err := app.Save(ingestTargets); err != nil {
			return err
		}

		// server_settings (generic key/value)
		serverSettings := core.NewBaseCollection("server_settings")
		serverSettings.Fields.Add(
			&core.TextField{Name: "key", Required: true, Max: 128, Presentable: true},
			&core.TextField{Name: "value", Max: 8192}, // allow JSON
		)
		serverSettings.AddIndex("ux_server_settings_key", true, "key", "")
		serverSettings.ListRule = types.Pointer("")
		serverSettings.ViewRule = types.Pointer("")
		if err := app.Save(serverSettings); err != nil {
			return err
		}

		return nil
	}, func(app core.App) error {
		// down: drop the collections if they exist
		_ = app.DeleteTable("ingest_targets")
		_ = app.DeleteTable("server_settings")
		return nil
	})
}

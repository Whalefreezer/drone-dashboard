package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Minimal initial schema to validate wiring: events collection
		events := core.NewBaseCollection("events")
		events.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.TextField{Name: "name", Required: true, Max: 255, Presentable: true},
		)
		events.AddIndex("ux_events_source", true, "source", "sourceId")
		return app.Save(events)
	}, func(app core.App) error {
		col, _ := app.FindCollectionByNameOrId("events")
		if col != nil {
			return app.Delete(col)
		}
		return nil
	})
}

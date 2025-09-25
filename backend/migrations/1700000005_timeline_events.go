package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		if _, err := app.FindCollectionByNameOrId("timeline_events"); err == nil {
			return nil
		}

		events, err := app.FindCollectionByNameOrId("events")
		if err != nil {
			return err
		}

		col := core.NewBaseCollection("timeline_events")
		col.Fields.Add(
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1, Required: true, Presentable: true},
			&core.DateField{Name: "startAt", Required: true, Presentable: true},
			&core.DateField{Name: "endAt"},
			&core.TextField{Name: "title", Required: true, Max: 160, Presentable: true},
			&core.TextField{Name: "description", Max: 4096},
			&core.SelectField{ // normalized categories drive styling in the UI
				Name:      "category",
				Values:    []string{"mandatory", "briefing", "practice", "qualifying", "race", "eliminations", "buffer", "break", "meal", "other"},
				MaxSelect: 1,
			},
			&core.BoolField{Name: "isAllDay"},
			&core.NumberField{Name: "sortKey"},
		)

		col.AddIndex("idx_timeline_events_event_start_sort", false, "event, startAt, sortKey", "")

		col.ListRule = types.Pointer("")
		col.ViewRule = types.Pointer("")

		if err := app.Save(col); err != nil {
			return err
		}

		return nil
	}, func(app core.App) error {
		_ = app.DeleteTable("timeline_events")
		return nil
	})
}

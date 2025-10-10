package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Converts pilots.event from one-to-many to many-to-many via event_pilots join table.
func init() {
	m.Register(func(app core.App) error {
		// Get event and pilot collections
		events, err := app.FindCollectionByNameOrId("events")
		if err != nil {
			return err
		}
		pilots, err := app.FindCollectionByNameOrId("pilots")
		if err != nil {
			return err
		}

		// Create event_pilots join table if it doesn't exist
		if _, err := app.FindCollectionByNameOrId("event_pilots"); err != nil {
			eventPilots := core.NewBaseCollection("event_pilots")
			eventPilots.Fields.Add(
				&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1, Required: true},
				&core.RelationField{Name: "pilot", CollectionId: pilots.Id, MaxSelect: 1, Required: true},
				&core.BoolField{Name: "removed"},
			)
			eventPilots.AddIndex("ux_event_pilots_relation", true, "event, pilot", "")
			eventPilots.ListRule = types.Pointer("")
			eventPilots.ViewRule = types.Pointer("")
			if err := app.Save(eventPilots); err != nil {
				return err
			}
		}

		// Migrate existing data: copy pilots.event → event_pilots
		eventPilots, err := app.FindCollectionByNameOrId("event_pilots")
		if err != nil {
			return err
		}

		pilotRecords, err := app.FindRecordsByFilter(pilots.Name, "", "", 0, 0)
		if err != nil {
			return err
		}

		for _, pilotRecord := range pilotRecords {
			eventId := pilotRecord.GetString("event")
			if eventId == "" {
				continue
			}

			// Check if join record already exists
			existing, _ := app.FindFirstRecordByFilter(
				eventPilots.Name,
				"event = {:event} && pilot = {:pilot}",
				map[string]any{
					"event": eventId,
					"pilot": pilotRecord.Id,
				},
			)
			if existing != nil {
				continue // already migrated
			}

			// Create join record
			joinRecord := core.NewRecord(eventPilots)
			joinRecord.Set("event", eventId)
			joinRecord.Set("pilot", pilotRecord.Id)
			if err := app.Save(joinRecord); err != nil {
				return err
			}
		}

		// Remove event field from pilots
		eventField := pilots.Fields.GetByName("event")
		if eventField != nil {
			pilots.Fields.RemoveById(eventField.GetId())
			if err := app.Save(pilots); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		// down: restore event field to pilots and delete event_pilots
		events, err := app.FindCollectionByNameOrId("events")
		if err != nil {
			return err
		}
		pilots, err := app.FindCollectionByNameOrId("pilots")
		if err != nil {
			return err
		}

		// Restore event field if missing
		if pilots.Fields.GetByName("event") == nil {
			pilots.Fields.Add(&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1})
			if err := app.Save(pilots); err != nil {
				return err
			}
		}

		// Delete event_pilots table
		_ = app.DeleteTable("event_pilots")
		return nil
	})
}

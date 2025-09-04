package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Adds races.raceOrder and a generic client_kv collection for client-facing small state.
func init() {
	m.Register(func(app core.App) error {
		// add raceOrder to races
		races, err := app.FindCollectionByNameOrId("races")
		if err != nil {
			return err
		}
		// Add only if missing
		if races.Fields.GetByName("raceOrder") == nil {
			races.Fields.Add(&core.NumberField{Name: "raceOrder", Required: false})
			if err := app.Save(races); err != nil {
				return err
			}
		}

		// create client_kv if missing
		if _, err := app.FindCollectionByNameOrId("client_kv"); err == nil {
			return nil
		}
		ev, err := app.FindCollectionByNameOrId("events")
		if err != nil {
			return err
		}
		clientKV := core.NewBaseCollection("client_kv")
		clientKV.Fields.Add(
			&core.TextField{Name: "namespace", Required: true, Max: 64},
			&core.TextField{Name: "key", Required: true, Max: 128, Presentable: true},
			&core.TextField{Name: "value", Max: 8192}, // JSON payload
			&core.RelationField{Name: "event", CollectionId: ev.Id, MaxSelect: 1},
			&core.NumberField{Name: "expiresAt"},
		)
		clientKV.AddIndex("ux_client_kv_scope", true, "namespace, event, key", "")
		clientKV.ListRule = types.Pointer("")
		clientKV.ViewRule = types.Pointer("")
		if err := app.Save(clientKV); err != nil {
			return err
		}
		return nil
	}, func(app core.App) error {
		// down: drop client_kv (we keep the additive raceOrder field)
		_ = app.DeleteTable("client_kv")
		return nil
	})
}

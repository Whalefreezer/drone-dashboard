package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Increase max length for client_kv.value from 8192 to 65536 (64KB)
func init() {
	m.Register(func(app core.App) error {
		clientKV, err := app.FindCollectionByNameOrId("client_kv")
		if err != nil {
			return err
		}

		// Update value field
		if field := clientKV.Fields.GetByName("value"); field != nil {
			if textField, ok := field.(*core.TextField); ok {
				textField.Max = 65536
			}
		}

		return app.Save(clientKV)
	}, func(app core.App) error {
		// down: revert to Max: 8192
		clientKV, err := app.FindCollectionByNameOrId("client_kv")
		if err != nil {
			return err
		}

		// Revert value field
		if field := clientKV.Fields.GetByName("value"); field != nil {
			if textField, ok := field.(*core.TextField); ok {
				textField.Max = 8192
			}
		}

		return app.Save(clientKV)
	})
}

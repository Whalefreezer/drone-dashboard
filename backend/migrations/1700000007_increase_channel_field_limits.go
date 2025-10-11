package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Increase max length for channels.band, channels.shortBand, and channels.channelPrefix from 8 to 32
func init() {
	m.Register(func(app core.App) error {
		channels, err := app.FindCollectionByNameOrId("channels")
		if err != nil {
			return err
		}

		// Update band field
		if field := channels.Fields.GetByName("band"); field != nil {
			if textField, ok := field.(*core.TextField); ok {
				textField.Max = 32
			}
		}

		// Update shortBand field
		if field := channels.Fields.GetByName("shortBand"); field != nil {
			if textField, ok := field.(*core.TextField); ok {
				textField.Max = 32
			}
		}

		// Update channelPrefix field
		if field := channels.Fields.GetByName("channelPrefix"); field != nil {
			if textField, ok := field.(*core.TextField); ok {
				textField.Max = 32
			}
		}

		return app.Save(channels)
	}, func(app core.App) error {
		// down: revert to Max: 8
		channels, err := app.FindCollectionByNameOrId("channels")
		if err != nil {
			return err
		}

		// Revert band field
		if field := channels.Fields.GetByName("band"); field != nil {
			if textField, ok := field.(*core.TextField); ok {
				textField.Max = 8
			}
		}

		// Revert shortBand field
		if field := channels.Fields.GetByName("shortBand"); field != nil {
			if textField, ok := field.(*core.TextField); ok {
				textField.Max = 8
			}
		}

		// Revert channelPrefix field
		if field := channels.Fields.GetByName("channelPrefix"); field != nil {
			if textField, ok := field.(*core.TextField); ok {
				textField.Max = 8
			}
		}

		return app.Save(channels)
	})
}

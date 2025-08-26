package migrations

import (
	"log/slog"
	"os"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// Check if environment variables are set
		email := os.Getenv("SUPERUSER_EMAIL")
		password := os.Getenv("SUPERUSER_PASSWORD")

		if email == "" || password == "" {
			slog.Info("migration.create_superuser.skipped",
				"reason", "environment variables not set",
				"SUPERUSER_EMAIL", email != "",
				"SUPERUSER_PASSWORD", password != "")
			return nil
		}

		// Get the superusers collection
		superusers, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
		if err != nil {
			return err
		}

		// Check if superuser already exists
		existingRecord, _ := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
		if existingRecord != nil {
			slog.Info("migration.create_superuser.skipped",
				"reason", "superuser already exists",
				"email", email)
			return nil
		}

		// Create new superuser record
		record := core.NewRecord(superusers)
		record.Set("email", email)
		record.Set("password", password)

		if err := app.Save(record); err != nil {
			return err
		}

		slog.Info("migration.create_superuser.created",
			"email", email)
		return nil
	}, func(app core.App) error {
		// Revert operation - delete the superuser if environment variables are set
		email := os.Getenv("SUPERUSER_EMAIL")
		if email == "" {
			return nil // No email to delete
		}

		record, _ := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
		if record == nil {
			slog.Info("migration.create_superuser.revert.skipped",
				"reason", "superuser not found",
				"email", email)
			return nil // probably already deleted
		}

		if err := app.Delete(record); err != nil {
			return err
		}

		slog.Info("migration.create_superuser.revert.deleted",
			"email", email)
		return nil
	})
}

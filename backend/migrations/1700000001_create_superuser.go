package migrations

import (
    "crypto/rand"
    "log/slog"
    "math/big"
    "os"

    "github.com/pocketbase/pocketbase/core"
    m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
    m.Register(func(app core.App) error {
        // Env-configurable email/password with sensible defaults
        email := os.Getenv("SUPERUSER_EMAIL")
        if email == "" {
            email = "admin@example.com"
        }
        password := os.Getenv("SUPERUSER_PASSWORD")
        generated := false
        if password == "" {
            // Generate a strong random password if not provided
            if p, err := generatePassword(24); err == nil {
                password = p
                generated = true
            } else {
                return err
            }
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

        // Always log creation; print password only if it was generated
        if generated {
            slog.Info("migration.create_superuser.created",
                "email", email,
                "password", password,
                "note", "password generated because SUPERUSER_PASSWORD was not set")
        } else {
            slog.Info("migration.create_superuser.created",
                "email", email)
        }
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

// generatePassword returns a random password of the requested length
// using a URL-safe alphanumeric+symbols charset.
func generatePassword(length int) (string, error) {
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+"
    max := big.NewInt(int64(len(charset)))
    out := make([]byte, length)
    for i := 0; i < length; i++ {
        n, err := rand.Int(rand.Reader, max)
        if err != nil {
            return "", err
        }
        out[i] = charset[n.Int64()]
    }
    return string(out), nil
}

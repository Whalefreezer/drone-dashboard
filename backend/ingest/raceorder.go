package ingest

import (
	"log/slog"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// RecalculateRaceOrder updates races.raceOrder for the given event using the provided app context.
// Uses DAO Find + Save to trigger realtime hooks/subscriptions. Safe to use with a transactional app.
func RecalculateRaceOrder(app core.App, eventPBID string) error {
	// Calculate new raceOrder values and compare with current values, only returning changed records
	query := `
        WITH ordered AS (
            SELECT r.id, ROW_NUMBER() OVER (
                ORDER BY round."order" ASC, r.raceNumber ASC
            ) AS pos
            FROM races r
            LEFT JOIN rounds round ON r.round = round.id
            WHERE r.event = {:eventId} AND r.valid = 1
        ),
        race_orders AS (
            SELECT r.id, r.raceOrder AS current_order,
                   CASE
                       WHEN r.valid = 1 THEN (SELECT pos FROM ordered WHERE ordered.id = r.id)
                       ELSE 0
                   END AS new_race_order
            FROM races r
            WHERE r.event = {:eventId}
        )
        SELECT id, new_race_order
        FROM race_orders
        WHERE current_order != new_race_order
    `

	type raceOrderResult struct {
		ID           string `db:"id"`
		NewRaceOrder int    `db:"new_race_order"`
	}

	var results []raceOrderResult
	if err := app.DB().NewQuery(query).Bind(dbx.Params{"eventId": eventPBID}).All(&results); err != nil {
		return err
	}

	for _, result := range results {
		race, err := app.FindRecordById("races", result.ID)
		if err != nil {
			slog.Warn("ingest.raceorder.find.error", "raceId", result.ID, "err", err)
			continue
		}
		race.Set("raceOrder", result.NewRaceOrder)
		if err := app.Save(race); err != nil {
			return err
		}
	}
	return nil
}

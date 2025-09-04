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

// ComputeRaceOrderForNew returns the raceOrder for a new valid race that would be inserted
// with (eventPBID, roundPBID, raceNumber). It counts existing valid races that would come
// before the new race by (round.order ASC, raceNumber ASC) and returns count + 1.
func ComputeRaceOrderForNew(app core.App, eventPBID, roundPBID string, raceNumber int) (int, error) {
	// Resolve the round order for the provided roundPBID
	var roundRow struct {
		Order int `db:"round_order"`
	}
	if err := app.DB().NewQuery("SELECT \"order\" as round_order FROM rounds WHERE id = {:rid}").
		Bind(dbx.Params{"rid": roundPBID}).One(&roundRow); err != nil {
		return 0, err
	}

	// Count existing valid races that come before the new race position
	// Ordering: rounds.order ASC, races.raceNumber ASC
	var row struct {
		C int `db:"c"`
	}
	countSQL := `
        SELECT COUNT(1) as c
        FROM races r
        LEFT JOIN rounds rd ON r.round = rd.id
        WHERE r.event = {:eventId}
          AND r.valid = 1
          AND (
                rd."order" < {:roundOrder}
             OR (rd."order" = {:roundOrder} AND r.raceNumber < {:raceNumber})
          )
    `
	if err := app.DB().NewQuery(countSQL).Bind(dbx.Params{
		"eventId":    eventPBID,
		"roundOrder": roundRow.Order,
		"raceNumber": raceNumber,
	}).One(&row); err != nil {
		return 0, err
	}
	return row.C + 1, nil
}

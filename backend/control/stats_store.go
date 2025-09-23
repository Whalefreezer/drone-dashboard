package control

import (
	"context"
	"database/sql"
	"errors"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const fetchStatsCollection = "control_stats"

// NewPocketBaseFetchStatsStore returns a FetchStatsStore backed by PocketBase.
func NewPocketBaseFetchStatsStore(app core.App) FetchStatsStore {
	if app == nil {
		return nil
	}
	return &pocketBaseFetchStatsStore{app: app}
}

type pocketBaseFetchStatsStore struct {
	app core.App
}

func (s *pocketBaseFetchStatsStore) UpsertFetchStats(ctx context.Context, bucket string, stats FetchStatsSnapshot) error {
	rec, err := s.app.FindFirstRecordByFilter(fetchStatsCollection, "bucket = {:bucket}", dbx.Params{"bucket": bucket})
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		rec = nil
	}
	if rec == nil {
		col, err := s.app.FindCollectionByNameOrId(fetchStatsCollection)
		if err != nil {
			return err
		}
		rec = core.NewRecord(col)
		rec.Set("bucket", bucket)
	}
	rec.Set("total", stats.Total)
	rec.Set("fullResponses", stats.FullResponses)
	rec.Set("etagHits", stats.ETagHits)
	rec.Set("errors", stats.Errors)
	return s.app.Save(rec)
}

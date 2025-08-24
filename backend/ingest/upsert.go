package ingest

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

const sourceName = "fpvtrackside"

// Upserter writes data into PocketBase using core.App
// Note: This is a minimal skeleton; concrete calls will be filled in Phase 3.
type Upserter struct {
	App core.App
}

func NewUpserter(app core.App) *Upserter { return &Upserter{App: app} }

// findExistingId returns the PB id for a given (source, sourceId) tuple if it exists
func (u *Upserter) findExistingId(collection string, sourceId string) (string, error) {
	q := u.App.DB().NewQuery(
		fmt.Sprintf("SELECT id FROM %s WHERE source = {:source} AND sourceId = {:sourceId} LIMIT 1", collection),
	)
	q.Bind(map[string]any{"source": sourceName, "sourceId": sourceId})
	var row struct{ ID string }
	_ = q.Column(&row.ID) // ignore error -> empty means not found
	return row.ID, nil
}

// Upsert creates or updates a record by (source, sourceId)
func (u *Upserter) Upsert(collection string, sourceId string, fields map[string]any) (string, error) {
	col, err := u.App.FindCollectionByNameOrId(collection)
	if err != nil {
		return "", err
	}

	existingId, _ := u.findExistingId(collection, sourceId)
	var record *core.Record
	if existingId != "" {
		record, err = u.App.FindRecordById(col, existingId)
		if err != nil {
			return "", err
		}
	} else {
		record = core.NewRecord(col)
	}

	record.Set("source", sourceName)
	record.Set("sourceId", sourceId)
	for k, v := range fields {
		record.Set(k, v)
	}

	if err := u.App.Save(record); err != nil {
		return "", err
	}
	return record.Id, nil
}

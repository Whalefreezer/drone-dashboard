package ingest

import (
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const sourceName = "fpvtrackside"

// Upserter writes data into PocketBase using core.App
// Note: This is a minimal skeleton; concrete calls will be filled in Phase 3.
type Upserter struct {
	App core.App
}

func NewUpserter(app core.App) *Upserter { return &Upserter{App: app} }

// findExistingId returns the PB id for a given (source, sourceId) if it exists
func (u *Upserter) findExistingId(collection string, sourceId string) (string, error) {
	rec, err := u.App.FindFirstRecordByFilter(collection, "source = {:source} && sourceId = {:sourceId}", dbx.Params{
		"source":   sourceName,
		"sourceId": sourceId,
	})
	if err == nil && rec != nil {
		return rec.Id, nil
	}
	// Fallback: try by sourceId only to recover older rows
	rec2, err2 := u.App.FindFirstRecordByFilter(collection, "sourceId = {:sourceId}", dbx.Params{
		"sourceId": sourceId,
	})
	if err2 == nil && rec2 != nil {
		return rec2.Id, nil
	}
	return "", nil
}

// GetExistingId returns the PB id for a given (source, sourceId) if it exists, or error if not found
func (u *Upserter) GetExistingId(collection string, sourceId string) (string, error) {
	id, err := u.findExistingId(collection, sourceId)
	if err != nil {
		return "", err
	}
	if id == "" {
		return "", fmt.Errorf("entity not found: collection=%s, sourceId=%s", collection, sourceId)
	}
	return id, nil
}

// Upsert creates or updates a record by (source, sourceId)
func (u *Upserter) Upsert(collection string, sourceId string, fields map[string]any) (string, error) {
	col, err := u.App.FindCollectionByNameOrId(collection)
	if err != nil {
		return "", err
	}

	existingId, err := u.findExistingId(collection, sourceId)
	if err != nil {
		return "", err
	}

	var record *core.Record
	if existingId != "" {
		record, err = u.App.FindRecordById(col, existingId)
		if err != nil {
			return "", err
		}
	} else {
		record = core.NewRecord(col)
	}

	// Set source + sourceId to align with the composite unique index
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

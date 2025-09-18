package ingest

import (
	"errors"
	"fmt"
	"reflect"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const sourceName = "fpvtrackside"

// EntityNotFoundError indicates that an expected record was not present in PocketBase.
type EntityNotFoundError struct {
	Collection string
	SourceID   string
}

func (e *EntityNotFoundError) Error() string {
	return fmt.Sprintf("entity not found: collection=%s, sourceId=%s", e.Collection, e.SourceID)
}

// IsEntityNotFound reports whether the provided error represents a missing entity.
func IsEntityNotFound(err error) bool {
	var target *EntityNotFoundError
	return errors.As(err, &target)
}

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
		return "", &EntityNotFoundError{Collection: collection, SourceID: sourceId}
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
	var isNewRecord bool
	if existingId != "" {
		record, err = u.App.FindRecordById(col, existingId)
		if err != nil {
			return "", err
		}
		isNewRecord = false
	} else {
		record = core.NewRecord(col)
		isNewRecord = true
	}

	// Check if any values have changed (only for existing records)
	hasChanges := false
	if !isNewRecord {
		// Always check source and sourceId fields
		if record.GetString("source") != sourceName {
			hasChanges = true
		}
		if record.GetString("sourceId") != sourceId {
			hasChanges = true
		}

		// Check if any of the provided fields have changed
		for k, v := range fields {
			existingVar := record.Get(k)
			if !valuesEqual(existingVar, v) {
				hasChanges = true
				break
			}
		}
	} else {
		// New records always need to be saved
		hasChanges = true
	}

	// Only save if there are changes or it's a new record
	if hasChanges {
		// Set source + sourceId to align with the composite unique index
		record.Set("source", sourceName)
		record.Set("sourceId", sourceId)
		for k, v := range fields {
			record.Set(k, v)
		}

		if err := u.App.Save(record); err != nil {
			return "", err
		}
	}

	return record.Id, nil
}

// valuesEqual compares two values, handling type conversions for common numeric types
func valuesEqual(existing, new any) bool {
	// If types are exactly the same, do direct comparison
	if reflect.TypeOf(existing) == reflect.TypeOf(new) {
		return existing == new
	}

	// Handle nil cases
	if existing == nil && new == nil {
		return true
	}
	if existing == nil || new == nil {
		return false
	}

	// Convert both to float64 for numeric comparison
	switch v := existing.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		existingFloat := reflect.ValueOf(v).Convert(reflect.TypeOf(float64(0))).Float()
		switch newV := new.(type) {
		case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
			newFloat := reflect.ValueOf(newV).Convert(reflect.TypeOf(float64(0))).Float()
			return existingFloat == newFloat
		}
	}

	// For non-numeric types, try string conversion
	existingStr := fmt.Sprintf("%v", existing)
	newStr := fmt.Sprintf("%v", new)
	return existingStr == newStr
}

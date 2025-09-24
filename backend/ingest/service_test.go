package ingest

import (
	"testing"

	_ "drone-dashboard/migrations"

	"github.com/pocketbase/pocketbase/tests"
)

func TestPurge(t *testing.T) {
	t.Helper()

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	// Create test service
	service := NewServiceWithSource(app, nil)

	// Test purging on empty database (should succeed)
	summary, err := service.Purge()
	if err != nil {
		t.Fatalf("Purge failed: %v", err)
	}

	// Verify summary shows zero counts
	if summary.Events != 0 || summary.Rounds != 0 || summary.Pilots != 0 ||
		summary.Channels != 0 || summary.Tracks != 0 || summary.Races != 0 ||
		summary.PilotChannels != 0 || summary.Detections != 0 || summary.Laps != 0 ||
		summary.GamePoints != 0 || summary.Results != 0 || summary.IngestTargets != 0 ||
		summary.CurrentOrders != 0 || summary.ControlStats != 0 {
		t.Errorf("Expected all counts to be 0, got: %+v", summary)
	}
}

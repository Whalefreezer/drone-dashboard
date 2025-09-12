package scheduler

import (
	"log/slog"
	"strings"
)

// -------------------- Helpers --------------------

func (m *Manager) findCurrentEventPBID() string {
	rec, err := m.App.FindFirstRecordByFilter("events", "isCurrent = true", nil)
	if err != nil {
		// Debug level: not critical; empty means none set
		slog.Debug("scheduler.findCurrentEventPBID.error", "err", err)
		return ""
	}
	if rec != nil {
		return rec.Id
	}
	return ""
}

// resolveEventSourceIdByPBID resolves the upstream sourceId from an event PB id.
func (m *Manager) resolveEventSourceIdByPBID(pbid string) string {
	if pbid == "" {
		return ""
	}
	col, err := m.App.FindCollectionByNameOrId("events")
	if err != nil {
		slog.Debug("scheduler.resolveEventSourceIdByPBID.collection.error", "eventPBID", pbid, "err", err)
		return ""
	}
	ev, err := m.App.FindRecordById(col, pbid)
	if err != nil || ev == nil {
		slog.Debug("scheduler.resolveEventSourceIdByPBID.find.error", "eventPBID", pbid, "err", err)
		return ""
	}
	return ev.GetString("sourceId")
}

// isEnabled checks server_settings key `scheduler.enabled` (default true).
func (m *Manager) isEnabled() bool {
	rec, err := m.App.FindFirstRecordByFilter("server_settings", "key = 'scheduler.enabled'", nil)
	if err != nil {
		slog.Debug("scheduler.isEnabled.read.error", "err", err)
		return true
	}
	if rec == nil {
		return true
	}
	val := strings.ToLower(strings.TrimSpace(rec.GetString("value")))
	return !(val == "false" || val == "0" || val == "off")
}

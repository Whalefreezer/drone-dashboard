package scheduler

import (
	"strings"
)

// -------------------- Helpers --------------------

func (m *Manager) findCurrentEventPBID() string {
	rec, err := m.App.FindFirstRecordByFilter("events", "isCurrent = true", nil)
	if err == nil && rec != nil {
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
		return ""
	}
	ev, err := m.App.FindRecordById(col, pbid)
	if err != nil || ev == nil {
		return ""
	}
	return ev.GetString("sourceId")
}

// isEnabled checks server_settings key `scheduler.enabled` (default true).
func (m *Manager) isEnabled() bool {
	rec, err := m.App.FindFirstRecordByFilter("server_settings", "key = 'scheduler.enabled'", nil)
	if err != nil || rec == nil {
		return true
	}
	val := strings.ToLower(strings.TrimSpace(rec.GetString("value")))
	return !(val == "false" || val == "0" || val == "off")
}

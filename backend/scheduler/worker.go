package scheduler

import (
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/pocketbase/dbx"
)

// -------------------- Worker --------------------

func (m *Manager) drainOnce() {
	nowMs := time.Now().UnixMilli()
	// Query only due & enabled targets ordered by nextDueAt, priority
	type dueRow struct {
		ID         string `db:"id"`
		Type       string `db:"type"`
		SourceID   string `db:"sourceId"`
		Event      string `db:"event"`
		IntervalMs int    `db:"intervalMs"`
		Priority   int    `db:"priority"`
	}
	var rows []dueRow
	q := `SELECT id, type, sourceId, event, intervalMs, priority
	      FROM ingest_targets
	      WHERE enabled = 1 AND nextDueAt <= {:now}
	      ORDER BY nextDueAt ASC, priority DESC
	      LIMIT {:lim}`
	if err := m.App.DB().NewQuery(q).Bind(dbx.Params{"now": nowMs, "lim": m.Cfg.Burst}).All(&rows); err != nil {
		return
	}
	if len(rows) == 0 {
		return
	}
	for _, rw := range rows {
		t := rw.Type
		sid := rw.SourceID
		// Resolve event sourceId from event relation id
		eventSourceId := m.resolveEventSourceIdByPBID(rw.Event)
		var runErr error
		switch t {
		case "event":
			runErr = m.Service.IngestEventMeta(eventSourceId)
		case "pilots":
			runErr = m.Service.IngestPilots(eventSourceId)
		case "channels":
			runErr = m.Service.IngestChannels(eventSourceId)
		case "rounds":
			runErr = m.Service.IngestRounds(eventSourceId)
		case "race":
			runErr = m.Service.IngestRace(eventSourceId, sid)
		case "results":
			_, runErr = m.Service.IngestResults(eventSourceId)
		default:
			slog.Warn("scheduler.worker.unknownType", "type", t)
		}
		if runErr != nil {
			slog.Warn("scheduler.worker.drainOnce.ingestError", "type", t, "sourceId", sid, "event", rw.Event, "error", runErr)
		}
		m.rescheduleRow(rw.ID, rw.IntervalMs, runErr)
	}
}

// rescheduleRow updates scheduling fields using the DAO to ensure subscriptions trigger.
func (m *Manager) rescheduleRow(id string, intervalMs int, runErr error) {
	now := time.Now()
	interval := time.Duration(intervalMs) * time.Millisecond
	if interval <= 0 {
		interval = m.Cfg.RaceIdle
	}

	// Find the record using DAO
	record, err := m.App.FindRecordById("ingest_targets", id)
	if err != nil {
		slog.Warn("scheduler.rescheduleRow.find.error", "id", id, "err", err)
		return
	}

	hadError := runErr != nil
	if hadError {
		// Update fields for error case
		record.Set("lastStatus", fmt.Sprintf("error: %v", runErr))
		record.Set("nextDueAt", m.nextDueAt(now, interval, true))
	} else {
		// Update fields for success case
		record.Set("lastStatus", "ok")
		record.Set("lastFetchedAt", now.UnixMilli())
		record.Set("nextDueAt", m.nextDueAt(now, interval, false))
	}

	// Save the record using DAO to trigger subscriptions
	if err := m.App.Save(record); err != nil {
		slog.Warn("scheduler.rescheduleRow.save.error", "id", id, "err", err)
	}
}

// nextDueAt computes the next due time given interval, jitter, and error state.
// On success: now + interval + jitter (jitter <= min(Cfg.JitterMs, interval/10)).
// On error: now + min(1s, 4*interval).
func (m *Manager) nextDueAt(now time.Time, interval time.Duration, hadError bool) int64 {
	if hadError {
		backoff := time.Second
		if bo := 4 * interval; backoff > bo {
			backoff = bo
		}
		return now.Add(backoff).UnixMilli()
	}
	intervalMs := int(interval / time.Millisecond)
	jitterCapMs := m.Cfg.JitterMs
	if cap2 := intervalMs / 10; cap2 < jitterCapMs {
		jitterCapMs = cap2
	}
	if jitterCapMs < 0 {
		jitterCapMs = 0
	}
	jitter := 0
	if jitterCapMs > 0 {
		jitter = rand.Intn(jitterCapMs)
	}
	return now.Add(interval).Add(time.Duration(jitter) * time.Millisecond).UnixMilli()
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

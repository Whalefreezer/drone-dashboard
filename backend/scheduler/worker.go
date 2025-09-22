package scheduler

import (
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"strings"
	"time"

	"drone-dashboard/control"
	"drone-dashboard/ingest"

	"github.com/pocketbase/dbx"
)

// -------------------- Worker --------------------

type dueRow struct {
	ID         string `db:"id"`
	Type       string `db:"type"`
	SourceID   string `db:"sourceId"`
	Event      string `db:"event"`
	NextDueAt  int64  `db:"nextDueAt"`
	IntervalMs int    `db:"intervalMs"`
	Priority   int    `db:"priority"`
}

var targetDependencies = map[string][]string{
	"event":    {},
	"pilots":   {"event"},
	"channels": {"event"},
	"rounds":   {"event"},
	"race":     {"event", "rounds", "pilots", "channels"},
	"results":  {"event", "rounds", "pilots", "channels"},
}

// shouldDeferTarget returns true when the row has upstream dependencies that aren't ready yet.
func (m *Manager) shouldDeferTarget(rw dueRow) (int64, string, bool) {
	deps := append([]string{}, targetDependencies[rw.Type]...)
	if len(deps) == 0 {
		return 0, "", false
	}
	// Deduplicate while preserving order so status messaging stays stable.
	seen := make(map[string]struct{}, len(deps))
	uniq := make([]string, 0, len(deps))
	for _, d := range deps {
		if _, ok := seen[d]; ok {
			continue
		}
		seen[d] = struct{}{}
		uniq = append(uniq, d)
	}
	return m.deferUntilTargetsReady(rw.Event, uniq)
}

func (m *Manager) workerLimiter() chan struct{} {
	m.workerSlotsOnce.Do(func() {
		limit := m.Cfg.Concurrency
		if limit <= 0 {
			limit = 1
		}
		m.workerSlots = make(chan struct{}, limit)
	})
	return m.workerSlots
}

func (m *Manager) drainOnce() {
	limiter := m.workerLimiter()
	if limiter == nil {
		return
	}
	available := m.availableSlots(limiter)
	if available <= 0 {
		return
	}
	rows, err := m.fetchDueRows(available)
	if err != nil {
		slog.Warn("scheduler.worker.query.error", "err", err)
		return
	}
	if len(rows) == 0 {
		return
	}
	for _, rw := range rows {
		limiter <- struct{}{}
		go func(r dueRow) {
			defer func() { <-limiter }()
			m.processDueRow(r)
		}(rw)
	}
}

func (m *Manager) availableSlots(limiter chan struct{}) int {
	return cap(limiter) - len(limiter)
}

func (m *Manager) fetchDueRows(limit int) ([]dueRow, error) {
	if limit <= 0 {
		return nil, nil
	}
	nowMs := time.Now().UnixMilli()
	var rows []dueRow
	q := `SELECT id, type, sourceId, event, nextDueAt, intervalMs, priority
		      FROM ingest_targets
		      WHERE enabled = 1 AND nextDueAt <= {:now}
		      ORDER BY nextDueAt ASC, priority DESC
		      LIMIT {:lim}`
	if err := m.App.DB().NewQuery(q).Bind(dbx.Params{"now": nowMs, "lim": limit}).All(&rows); err != nil {
		return nil, err
	}
	return rows, nil
}

func (m *Manager) processDueRow(rw dueRow) {
	if nextDue, status, blocked := m.shouldDeferTarget(rw); blocked {
		m.rescheduleRowCustom(rw.ID, nextDue, status)
		return
	}

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
		var missing *ingest.EntityNotFoundError
		if errors.As(runErr, &missing) {
			slog.Info("scheduler.worker.dependencyMissing", "type", t, "sourceId", sid, "event", rw.Event, "collection", missing.Collection, "missingSourceId", missing.SourceID, "error", runErr)
		} else {
			fields := []any{"type", t, "sourceId", sid, "event", rw.Event, "error", runErr}
			var traced control.TraceCarrier
			if errors.As(runErr, &traced) && traced != nil && traced.TraceID() != "" {
				fields = append(fields, "traceId", traced.TraceID())
			}
			slog.Warn("scheduler.worker.drainOnce.ingestError", fields...)
		}
	}
	m.rescheduleRow(rw.ID, rw.IntervalMs, runErr)
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

	if runErr != nil {
		// Update fields for error case while distinguishing dependency gaps
		var missing *ingest.EntityNotFoundError
		if errors.As(runErr, &missing) {
			record.Set("lastStatus", fmt.Sprintf("waiting for %s:%s", missing.Collection, missing.SourceID))
		} else {
			record.Set("lastStatus", fmt.Sprintf("error: %v", runErr))
		}
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

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// deferUntilTargetsReady ensures prerequisite ingest targets have completed successfully before running.
// It returns (nextDueAtMs, status, true) if the row should be rescheduled to wait for dependencies.
func (m *Manager) deferUntilTargetsReady(eventPBID string, deps []string) (int64, string, bool) {
	if len(deps) == 0 {
		return 0, "", false
	}
	now := time.Now()
	if eventPBID == "" {
		next := now.Add(m.Cfg.FullInterval).UnixMilli()
		return next, "waiting for event", true
	}
	nowMs := now.UnixMilli()
	var (
		nextDue int64
		waiting []string
	)
	for _, depType := range deps {
		var dep struct {
			ID         string `db:"id"`
			LastStatus string `db:"lastStatus"`
			NextDueAt  int64  `db:"nextDueAt"`
		}
		query := `SELECT id, lastStatus, nextDueAt FROM ingest_targets WHERE type = {:type} AND event = {:event} LIMIT 1`
		if err := m.App.DB().NewQuery(query).Bind(dbx.Params{"type": depType, "event": eventPBID}).One(&dep); err != nil || dep.ID == "" {
			waiting = append(waiting, depType)
			nextDue = max64(nextDue, now.Add(m.Cfg.FullInterval).UnixMilli())
			if err != nil {
				slog.Warn("scheduler.dependencies.lookup.error", "dep", depType, "event", eventPBID, "err", err)
			}
			continue
		}
		if dep.LastStatus != "ok" {
			waiting = append(waiting, depType)
			candidate := dep.NextDueAt
			if candidate == 0 || candidate <= nowMs {
				candidate = now.Add(time.Second).UnixMilli()
			} else {
				candidate = time.UnixMilli(candidate).Add(150 * time.Millisecond).UnixMilli()
			}
			nextDue = max64(nextDue, candidate)
		}
	}
	if len(waiting) == 0 {
		return 0, "", false
	}
	if nextDue == 0 {
		nextDue = now.Add(time.Second).UnixMilli()
	}
	status := fmt.Sprintf("waiting for %s", strings.Join(waiting, ","))
	return nextDue, status, true
}

// rescheduleRowCustom updates nextDueAt and optionally lastStatus without changing lastFetchedAt.
func (m *Manager) rescheduleRowCustom(id string, nextDueAtMs int64, status string) {
	rec, err := m.App.FindRecordById("ingest_targets", id)
	if err != nil || rec == nil {
		slog.Warn("scheduler.rescheduleRowCustom.find.error", "id", id, "err", err)
		return
	}
	if status != "" {
		rec.Set("lastStatus", status)
	}
	rec.Set("nextDueAt", nextDueAtMs)
	if err := m.App.Save(rec); err != nil {
		slog.Warn("scheduler.rescheduleRowCustom.save.error", "id", id, "err", err)
	}
}

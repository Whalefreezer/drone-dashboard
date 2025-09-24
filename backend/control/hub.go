package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Hub manages active pits connections and request/response correlation.
type Hub struct {
	mu                  sync.RWMutex
	conns               map[string]WSConn // pitsId -> connection
	pending             map[string]chan Envelope
	timeout             time.Duration
	inflight            atomic.Int64
	statsMu             sync.RWMutex
	stats               map[string]*fetchMetrics
	statsStore          FetchStatsStore
	currentRaceProvider CurrentRaceProvider
}

func NewHub() *Hub {
	return &Hub{
		conns:   make(map[string]WSConn),
		pending: make(map[string]chan Envelope),
		stats:   make(map[string]*fetchMetrics),
		timeout: 10 * time.Second,
	}
}

type fetchMetrics struct {
	total         atomic.Int64
	fullResponses atomic.Int64
	etagHits      atomic.Int64
	errors        atomic.Int64
}

// FetchStatsSnapshot captures aggregate fetch metrics for reporting.
type FetchStatsSnapshot struct {
	Total         int64 `json:"total"`
	FullResponses int64 `json:"fullResponses"`
	ETagHits      int64 `json:"etagHits"`
	Errors        int64 `json:"errors"`
}

const overallStatsKey = "overall"

// FetchStatsStore persists fetch metrics snapshots for external consumers.
type FetchStatsStore interface {
	UpsertFetchStats(ctx context.Context, bucket string, stats FetchStatsSnapshot) error
}

// SetFetchStatsStore configures an optional persistence sink for fetch stats.
func (h *Hub) SetFetchStatsStore(store FetchStatsStore) {
	h.statsStore = store
}

// SetCurrentRaceProvider configures an optional provider to detect the active race.
func (h *Hub) SetCurrentRaceProvider(provider CurrentRaceProvider) {
	h.currentRaceProvider = provider
}

// ClearCurrentRaceCache clears the current race provider cache if set.
func (h *Hub) ClearCurrentRaceCache() {
	if h.currentRaceProvider != nil {
		h.currentRaceProvider.ClearCache()
	}
}

// WSConn abstracts the minimal send/close operations used by the hub.
type WSConn interface {
	SendJSON(v any) error
	Close() error
}

func (h *Hub) Register(pitsID string, c *Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	slog.Debug("control.hub.register", "pitsId", pitsID)
	if prev, ok := h.conns[pitsID]; ok {
		_ = prev.Close()
	}
	h.conns[pitsID] = c
}

func (h *Hub) Unregister(pitsID string, c *Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	slog.Debug("control.hub.unregister", "pitsId", pitsID)
	if cur, ok := h.conns[pitsID]; ok {
		if curc, ok2 := cur.(*Conn); ok2 && curc == c {
			delete(h.conns, pitsID)
			return
		}
	}
}

func (h *Hub) SetTimeout(d time.Duration) { h.timeout = d }

func (h *Hub) DoFetch(ctx context.Context, pitsID string, f Fetch) (resp Response, err error) {
	start := time.Now()
	started := h.inflight.Add(1)
	ctx, traceID := EnsureTraceID(ctx)
	var requestID string
	sentToPits := false
	defer func() {
		if !sentToPits {
			return
		}
		h.recordFetchResult(f.Path, resp.Status, err)
	}()
	defer func() {
		remaining := h.inflight.Add(-1)
		latency := time.Since(start).Milliseconds()
		traceField := traceID
		if traceErr, ok := err.(TraceCarrier); ok && traceErr.TraceID() != "" {
			traceField = traceErr.TraceID()
		}
		fields := []any{
			"pitsId", pitsID,
			"path", f.Path,
			"latencyMs", latency,
			"inflight", remaining,
			"startedInflight", started,
			"traceId", traceField,
			"requestId", requestID,
		}
		if err != nil {
			fields = append(fields, "error", err.Error())
		} else {
			fields = append(fields, "status", resp.Status)
		}
		slog.Debug("control.hub.fetch", fields...)
	}()

	h.mu.RLock()
	connRaw, ok := h.conns[pitsID]
	h.mu.RUnlock()
	if !ok {
		err = NewTraceError(traceID, fmt.Errorf("no pits connection for %s", pitsID))
		return
	}
	id := fmt.Sprintf("%d-%d", time.Now().UnixNano(), time.Now().Unix())
	requestID = id
	fetch := f
	fetch.TraceID = traceID
	env := NewEnvelope(TypeFetch, id, fetch)
	env.TraceID = traceID

	fields := []any{
		"pitsId", pitsID,
		"path", fetch.Path,
		"requestId", requestID,
		"traceId", traceID,
		"timeoutMs", fetch.TimeoutMs,
	}
	if fetch.IfNoneMatch != "" {
		fields = append(fields, "ifNoneMatch", fetch.IfNoneMatch)
	}
	slog.Debug("control.hub.fetch.send", fields...)

	ch := make(chan Envelope, 1)
	h.mu.Lock()
	h.pending[id] = ch
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		delete(h.pending, id)
		h.mu.Unlock()
	}()

	if err = connRaw.SendJSON(env); err != nil {
		err = NewTraceError(traceID, err)
		return
	}
	sentToPits = true

	select {
	case <-ctx.Done():
		err = NewTraceError(traceID, ctx.Err())
		return
	case envResp := <-ch:
		respTraceID := envResp.TraceID
		if respTraceID == "" {
			respTraceID = traceID
		}
		switch envResp.Type {
		case TypeResponse:
			var r Response
			// envResp.Payload is raw json; re-marshal to bytes then unmarshal
			b, _ := json.Marshal(envResp.Payload)
			if err = json.Unmarshal(b, &r); err != nil {
				err = NewTraceError(respTraceID, err)
				return
			}
			resp = r
			return
		case TypeError:
			b, _ := json.Marshal(envResp.Payload)
			var er Error
			_ = json.Unmarshal(b, &er)
			if er.Message == "" {
				er.Message = "remote error"
			}
			err = NewTraceError(respTraceID, errors.New(er.Message))
			return
		default:
			err = NewTraceError(respTraceID, fmt.Errorf("unexpected response type: %s", envResp.Type))
			return
		}
	case <-time.After(h.timeout):
		err = NewTraceError(traceID, fmt.Errorf("timeout waiting for response"))
		return
	}
}

func (h *Hub) InFlight() int64 {
	return h.inflight.Load()
}

// deliver is called by the server when a message with matching id arrives.
func (h *Hub) deliver(env Envelope) {
	h.mu.RLock()
	ch, ok := h.pending[env.ID]
	h.mu.RUnlock()
	if !ok {
		slog.Warn("control.hub.deliver.no_pending", "id", env.ID, "traceId", env.TraceID)
		return
	}
	ch <- env
}

func (h *Hub) recordFetchResult(path string, status int, err error) {
	keys := []string{overallStatsKey}

	var currentRace CurrentRaceInfo
	if h.currentRaceProvider != nil {
		if info, infoErr := h.currentRaceProvider.CurrentRace(); infoErr == nil {
			currentRace = info
		} else if !errors.Is(infoErr, ErrNoCurrentRace) {
			slog.Debug("control.hub.currentRace.lookup.error", "err", infoErr)
		}
	}

	if primary, extras := classifyFetchPath(path, currentRace); primary != "" {
		keys = append(keys, primary)
		if len(extras) > 0 {
			keys = append(keys, extras...)
		}
	}
	for _, key := range keys {
		bucket := h.ensureMetricsBucket(key)
		bucket.total.Add(1)
		if err != nil {
			bucket.errors.Add(1)
			h.persistFetchStats(key, bucket)
			continue
		}
		if status == http.StatusNotModified {
			bucket.etagHits.Add(1)
		} else {
			bucket.fullResponses.Add(1)
		}
		h.persistFetchStats(key, bucket)
	}
}

func (h *Hub) ensureMetricsBucket(key string) *fetchMetrics {
	h.statsMu.RLock()
	bucket, ok := h.stats[key]
	h.statsMu.RUnlock()
	if ok {
		return bucket
	}
	h.statsMu.Lock()
	defer h.statsMu.Unlock()
	if bucket, ok = h.stats[key]; ok {
		return bucket
	}
	bucket = &fetchMetrics{}
	h.stats[key] = bucket
	return bucket
}

func (h *Hub) persistFetchStats(key string, bucket *fetchMetrics) {
	if h.statsStore == nil {
		return
	}
	snapshot := snapshotFetchMetrics(bucket)
	if err := h.statsStore.UpsertFetchStats(context.Background(), key, snapshot); err != nil {
		slog.Warn("control.hub.fetch_stats.persist.error", "bucket", key, "err", err)
	}
}

func (h *Hub) FetchStatsSnapshot() map[string]FetchStatsSnapshot {
	h.statsMu.RLock()
	defer h.statsMu.RUnlock()
	out := make(map[string]FetchStatsSnapshot, len(h.stats))
	for key, bucket := range h.stats {
		out[key] = FetchStatsSnapshot{
			Total:         bucket.total.Load(),
			FullResponses: bucket.fullResponses.Load(),
			ETagHits:      bucket.etagHits.Load(),
			Errors:        bucket.errors.Load(),
		}
	}
	if _, ok := out[overallStatsKey]; !ok {
		out[overallStatsKey] = FetchStatsSnapshot{}
	}
	return out
}

func snapshotFetchMetrics(bucket *fetchMetrics) FetchStatsSnapshot {
	return FetchStatsSnapshot{
		Total:         bucket.total.Load(),
		FullResponses: bucket.fullResponses.Load(),
		ETagHits:      bucket.etagHits.Load(),
		Errors:        bucket.errors.Load(),
	}
}

func classifyFetchPath(path string, current CurrentRaceInfo) (string, []string) {
	cleanPath := stripQuery(path)
	switch {
	case cleanPath == "/":
		return "eventSource", nil
	case strings.HasSuffix(cleanPath, "/Event.json"):
		return "event", nil
	case strings.HasSuffix(cleanPath, "/Pilots.json"):
		return "pilots", nil
	case strings.HasSuffix(cleanPath, "/Rounds.json"):
		return "rounds", nil
	case strings.HasSuffix(cleanPath, "/Results.json"):
		return "results", nil
	case strings.HasSuffix(cleanPath, "/Race.json"):
		if current.EventSourceID != "" && current.RaceSourceID != "" {
			eventID, raceID := extractEventRaceIdentifiers(cleanPath)
			if eventID == current.EventSourceID && raceID == current.RaceSourceID {
				return "raceCurrent", nil
			}
		}
		return "raceOther", nil
	case strings.HasSuffix(cleanPath, "/Channels.json"):
		return "channels", nil
	case cleanPath == "":
		return "", nil
	default:
		return "other", nil
	}
}

func stripQuery(path string) string {
	if i := strings.Index(path, "?"); i >= 0 {
		return path[:i]
	}
	return path
}

func extractEventRaceIdentifiers(path string) (string, string) {
	trimmed := strings.Trim(path, "/")
	parts := strings.Split(trimmed, "/")
	if len(parts) < 4 {
		return "", ""
	}
	if parts[0] != "events" {
		return "", ""
	}
	eventID := parts[1]
	raceID := parts[2]
	return eventID, raceID
}

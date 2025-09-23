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
	mu       sync.RWMutex
	conns    map[string]WSConn // pitsId -> connection
	pending  map[string]chan Envelope
	timeout  time.Duration
	inflight atomic.Int64
	statsMu  sync.RWMutex
	stats    map[string]*fetchMetrics
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
	buckets := []*fetchMetrics{h.ensureMetricsBucket(overallStatsKey)}
	if key := classifyFetchPath(path); key != "" {
		buckets = append(buckets, h.ensureMetricsBucket(key))
	}
	for _, bucket := range buckets {
		bucket.total.Add(1)
		if err != nil {
			bucket.errors.Add(1)
			continue
		}
		if status == http.StatusNotModified {
			bucket.etagHits.Add(1)
		} else {
			bucket.fullResponses.Add(1)
		}
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

func classifyFetchPath(path string) string {
	switch {
	case path == "/":
		return "eventSource"
	case strings.HasSuffix(path, "/Event.json"):
		return "event"
	case strings.HasSuffix(path, "/Pilots.json"):
		return "pilots"
	case strings.HasSuffix(path, "/Rounds.json"):
		return "rounds"
	case strings.HasSuffix(path, "/Results.json"):
		return "results"
	case strings.HasSuffix(path, "/Race.json"):
		return "race"
	case strings.HasSuffix(path, "/Channels.json"):
		return "channels"
	case path == "":
		return ""
	default:
		return "other"
	}
}

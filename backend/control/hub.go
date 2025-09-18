package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
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
}

func NewHub() *Hub {
	return &Hub{conns: make(map[string]WSConn), pending: make(map[string]chan Envelope), timeout: 10 * time.Second}
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
	defer func() {
		remaining := h.inflight.Add(-1)
		fields := []any{"pitsId", pitsID, "path", f.Path, "latencyMs", time.Since(start).Milliseconds(), "inflight", remaining, "startedInflight", started}
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
		err = fmt.Errorf("no pits connection for %s", pitsID)
		return
	}
	id := fmt.Sprintf("%d-%d", time.Now().UnixNano(), time.Now().Unix())
	env := NewEnvelope(TypeFetch, id, f)

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
		return
	}

	select {
	case <-ctx.Done():
		err = ctx.Err()
		return
	case envResp := <-ch:
		switch envResp.Type {
		case TypeResponse:
			var r Response
			// envResp.Payload is raw json; re-marshal to bytes then unmarshal
			b, _ := json.Marshal(envResp.Payload)
			if err = json.Unmarshal(b, &r); err != nil {
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
			err = errors.New(er.Message)
			return
		default:
			err = fmt.Errorf("unexpected response type: %s", envResp.Type)
			return
		}
	case <-time.After(h.timeout):
		err = fmt.Errorf("timeout waiting for response")
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
		slog.Warn("control.hub.deliver.no_pending", "id", env.ID)
		return
	}
	ch <- env
}

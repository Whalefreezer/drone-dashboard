package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// Hub manages active pits connections and request/response correlation.
type Hub struct {
	mu      sync.RWMutex
	conns   map[string]WSConn // pitsId -> connection
	pending map[string]chan Envelope
	timeout time.Duration
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

func (h *Hub) DoFetch(ctx context.Context, pitsID string, f Fetch) (Response, error) {
	h.mu.RLock()
	connRaw, ok := h.conns[pitsID]
	h.mu.RUnlock()
	if !ok {
		return Response{}, fmt.Errorf("no pits connection for %s", pitsID)
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

	if err := connRaw.SendJSON(env); err != nil {
		return Response{}, err
	}

	select {
	case <-ctx.Done():
		return Response{}, ctx.Err()
	case envResp := <-ch:
		switch envResp.Type {
		case TypeResponse:
			var r Response
			// envResp.Payload is raw json; re-marshal to bytes then unmarshal
			b, _ := json.Marshal(envResp.Payload)
			if err := json.Unmarshal(b, &r); err != nil {
				return Response{}, err
			}
			return r, nil
		case TypeError:
			b, _ := json.Marshal(envResp.Payload)
			var er Error
			_ = json.Unmarshal(b, &er)
			if er.Message == "" {
				er.Message = "remote error"
			}
			return Response{}, errors.New(er.Message)
		default:
			return Response{}, fmt.Errorf("unexpected response type: %s", envResp.Type)
		}
	case <-time.After(h.timeout):
		return Response{}, fmt.Errorf("timeout waiting for response")
	}
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

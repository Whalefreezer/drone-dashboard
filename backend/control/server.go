package control

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pocketbase/pocketbase/core"
)

const (
	serverPingInterval = 30 * time.Second
	serverReadTimeout  = 60 * time.Second
)

// Conn wraps a gorilla websocket connection with JSON helpers.
type Conn struct {
	ws *websocket.Conn
	// optional identity
	PitsID string
	hub    *Hub
	// serialize writes to avoid concurrent write panics
	writeMu sync.Mutex
}

func (c *Conn) SendJSON(v any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	c.ws.SetWriteDeadline(time.Now().Add(15 * time.Second))
	return c.ws.WriteJSON(v)
}

func (c *Conn) Close() error { return c.ws.Close() }

var upgrader = websocket.Upgrader{
	ReadBufferSize:    4096,
	WriteBufferSize:   4096,
	EnableCompression: true,
	CheckOrigin:       func(r *http.Request) bool { return true },
}

// RegisterServer registers the /control route on the PocketBase router for cloud mode.
func RegisterServer(app core.App, hub *Hub, authSecret string) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.Any("/control", func(c *core.RequestEvent) error {
			// Simple bearer check; production can be JWT or mTLS (handled at proxy)
			if authSecret != "" {
				auth := c.Request.Header.Get("Authorization")
				if !strings.HasPrefix(auth, "Bearer ") || strings.TrimPrefix(auth, "Bearer ") != authSecret {
					return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				}
			}

			w := c.Response
			r := c.Request
			ws, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				return c.InternalServerError("upgrade", err)
			}
			slog.Debug("control.server.connection", "remote", r.RemoteAddr)
			conn := &Conn{ws: ws, hub: hub}

			go serveConn(conn, hub)
			return nil
		})
		return se.Next()
	})
}

func serveConn(c *Conn, hub *Hub) {
	defer c.ws.Close()
	// On connect, send hello
	_ = c.SendJSON(NewEnvelope(TypeHello, "", Hello{ProtocolVersion: 1, ServerTimeMs: time.Now().UnixMilli()}))
	slog.Debug("control.server.hello_sent", "pitsId", c.PitsID)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stopPing := c.startPingLoop(ctx)
	defer stopPing()

	_ = c.consumeFrames(hub)
}

func (c *Conn) startPingLoop(ctx context.Context) func() {
	stop := make(chan struct{})
	var once sync.Once
	ticker := time.NewTicker(serverPingInterval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				slog.Debug("control.server.ping.stop", "pitsId", c.PitsID, "reason", "ctx")
				return
			case <-stop:
				slog.Debug("control.server.ping.stop", "pitsId", c.PitsID, "reason", "loop_exit")
				return
			case <-ticker.C:
				if err := c.SendJSON(NewEnvelope(TypePing, "", nil)); err != nil {
					slog.Warn("control.server.ping.error", "err", err, "pitsId", c.PitsID)
					_ = c.ws.Close()
					return
				}
				slog.Debug("control.server.ping.sent", "pitsId", c.PitsID)
			}
		}
	}()
	return func() {
		once.Do(func() { close(stop) })
	}
}

func (c *Conn) consumeFrames(hub *Hub) error {
	for {
		var env Envelope
		c.ws.SetReadDeadline(time.Now().Add(serverReadTimeout))
		if err := c.ws.ReadJSON(&env); err != nil {
			slog.Warn("control.server.read.error", "err", err, "pitsId", c.PitsID)
			if c.PitsID != "" {
				hub.Unregister(c.PitsID, c)
			}
			return err
		}
		slog.Debug("control.server.frame", "type", env.Type, "id", env.ID, "traceId", env.TraceID, "pitsId", c.PitsID)
		c.handleEnvelope(hub, env)
	}
}

func (c *Conn) handleEnvelope(hub *Hub, env Envelope) {
	switch env.Type {
	case TypeHello:
		c.registerPits(hub, env)
	case TypeResponse, TypeError:
		slog.Debug("control.server.deliver", "id", env.ID, "type", env.Type, "traceId", env.TraceID, "pitsId", c.PitsID)
		hub.deliver(env)
	case TypePing:
		slog.Debug("control.server.pong", "id", env.ID, "traceId", env.TraceID, "pitsId", c.PitsID)
		pong := NewEnvelope(TypePong, env.ID, nil)
		pong.TraceID = env.TraceID
		_ = c.SendJSON(pong)
	case TypePong:
		// ignore
	default:
		// ignore
	}
}

func (c *Conn) registerPits(hub *Hub, env Envelope) {
	b, _ := json.Marshal(env.Payload)
	var h Hello
	_ = json.Unmarshal(b, &h)
	c.PitsID = h.PitsID
	if c.PitsID == "" {
		c.PitsID = "default"
	}
	slog.Debug("control.server.register", "pitsId", c.PitsID)
	hub.Register(c.PitsID, c)
}

// DecodeResponse decodes a control Response into status, headers, and body bytes.
func DecodeResponse(r Response) (int, map[string]string, []byte) {
	var body []byte
	if r.BodyB64 != "" {
		b, _ := base64.StdEncoding.DecodeString(r.BodyB64)
		body = b
	}
	return r.Status, r.Headers, body
}

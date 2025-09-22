package control

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"drone-dashboard/fpvhttp"

	"github.com/gorilla/websocket"
)

const (
	clientPingInterval = 30 * time.Second
	clientReadTimeout  = 60 * time.Second
)

// PitsClient maintains an outbound WS to cloud and handles fetch commands.
type PitsClient struct {
	CloudURL  string
	AuthToken string
	PitsID    string
	FPVBase   *url.URL
	HTTP      *http.Client
}

func NewPitsClient(cloudURL, authToken, pitsID string, fpvBase string) (*PitsClient, error) {
	u, err := url.Parse(fpvBase)
	if err != nil {
		return nil, err
	}
	return &PitsClient{
		CloudURL:  cloudURL,
		AuthToken: authToken,
		PitsID:    pitsID,
		FPVBase:   u,
		HTTP:      fpvhttp.Shared(),
	}, nil
}

func (p *PitsClient) Start(ctx context.Context) {
	backoff := time.Second
	for {
		if ctx.Err() != nil {
			slog.Debug("control.pits.context_done")
			return
		}
		if err := p.runOnce(ctx); err != nil {
			slog.Warn("control.pits.run.error", "err", err)
		}
		time.Sleep(backoff)
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (p *PitsClient) runOnce(ctx context.Context) error {
	ws, writeMu, err := p.connect(ctx)
	if err != nil {
		return err
	}
	defer ws.Close()

	stopPing := p.startPingLoop(ctx, ws, writeMu)
	defer stopPing()

	return p.consumeFrames(ctx, ws, writeMu)
}

// safeWriteJSON serializes writes across goroutines and sets a write deadline.
func safeWriteJSON(mu *sync.Mutex, ws *websocket.Conn, v any) error {
	mu.Lock()
	defer mu.Unlock()
	ws.SetWriteDeadline(time.Now().Add(15 * time.Second))
	return ws.WriteJSON(v)
}

func (p *PitsClient) handleFetch(mu *sync.Mutex, ws *websocket.Conn, env Envelope) {
	b, _ := json.Marshal(env.Payload)
	var f Fetch
	if err := json.Unmarshal(b, &f); err != nil {
		errEnv := NewEnvelope(TypeError, env.ID, Error{Code: "BAD_REQUEST", Message: "invalid fetch"})
		errEnv.TraceID = env.TraceID
		_ = safeWriteJSON(mu, ws, errEnv)
		return
	}
	traceID := f.TraceID
	if traceID == "" {
		traceID = env.TraceID
	}
	slog.Debug("control.pits.fetch", "path", f.Path, "timeoutMs", f.TimeoutMs, "traceId", traceID)
	if strings.ToUpper(f.Method) != "GET" && strings.ToUpper(f.Method) != "HEAD" {
		errEnv := NewEnvelope(TypeError, env.ID, Error{Code: "DENIED", Message: "method not allowed"})
		errEnv.TraceID = traceID
		_ = safeWriteJSON(mu, ws, errEnv)
		return
	}
	// basic allowlist: only /events, /httpfiles, root
	if !(f.Path == "/" || strings.HasPrefix(f.Path, "/events/") || strings.HasPrefix(f.Path, "/httpfiles/")) {
		errEnv := NewEnvelope(TypeError, env.ID, Error{Code: "DENIED", Message: "path not allowed"})
		errEnv.TraceID = traceID
		_ = safeWriteJSON(mu, ws, errEnv)
		return
	}
	// Build URL
	u := *p.FPVBase
	u.Path = f.Path
	timeout := time.Second
	if f.TimeoutMs > 0 {
		timeout = time.Duration(f.TimeoutMs) * time.Millisecond
	}
	ctxFetch, cancelFetch := context.WithTimeout(context.Background(), timeout)
	defer cancelFetch()
	req, _ := http.NewRequestWithContext(ctxFetch, http.MethodGet, u.String(), nil)
	// Prefer uncompressed to simplify hashing
	req.Header.Set("Accept-Encoding", "identity")
	start := time.Now()
	resp, err := p.HTTP.Do(req)
	if err != nil {
		slog.Warn("control.pits.fetch.http_error", "path", f.Path, "requestId", env.ID, "traceId", traceID, "err", err)
		errEnv := NewEnvelope(TypeError, env.ID, Error{Code: "INTERNAL", Message: err.Error()})
		errEnv.TraceID = traceID
		if sendErr := safeWriteJSON(mu, ws, errEnv); sendErr != nil {
			slog.Warn("control.pits.fetch.send.error", "path", f.Path, "requestId", env.ID, "traceId", traceID, "err", sendErr)
		} else {
			slog.Debug("control.pits.fetch.sent", "path", f.Path, "requestId", env.ID, "traceId", traceID, "status", "error", "bytes", 0)
		}
		return
	}
	defer resp.Body.Close()
	body, _ := ioReadAllCap(resp.Body, 8*1024*1024)

	// Compute ETag
	etag := ""
	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "application/json") {
		if can, err := CanonicalizeJSON(body); err == nil {
			body = can
		}
	}
	etag = ComputeETag(body)
	latency := time.Since(start).Milliseconds()
	commonFields := []any{
		"path", f.Path,
		"requestId", env.ID,
		"traceId", traceID,
		"latencyMs", latency,
		"originStatus", resp.StatusCode,
		"bytes", len(body),
		"etag", etag,
	}
	if f.IfNoneMatch != "" {
		commonFields = append(commonFields, "ifNoneMatch", f.IfNoneMatch)
	}
	if f.IfNoneMatch != "" && f.IfNoneMatch == etag {
		resultFields := append([]any{}, commonFields...)
		resultFields = append(resultFields, "status", http.StatusNotModified, "fromCache", true)
		slog.Debug("control.pits.fetch.result", resultFields...)
		respEnv := NewEnvelope(TypeResponse, env.ID, Response{Status: http.StatusNotModified, Headers: map[string]string{"ETag": etag}})
		respEnv.TraceID = traceID
		if err := safeWriteJSON(mu, ws, respEnv); err != nil {
			slog.Warn("control.pits.fetch.send.error", "path", f.Path, "requestId", env.ID, "traceId", traceID, "err", err)
			return
		}
		slog.Debug("control.pits.fetch.sent", "path", f.Path, "requestId", env.ID, "traceId", traceID, "status", http.StatusNotModified, "bytes", 0)
		return
	}
	// Headers
	hdrs := map[string]string{"ETag": etag}
	if ct != "" {
		hdrs["Content-Type"] = ct
	}
	payload := Response{Status: resp.StatusCode, Headers: hdrs, BodyB64: base64.StdEncoding.EncodeToString(body)}
	resultFields := append([]any{}, commonFields...)
	resultFields = append(resultFields, "status", resp.StatusCode, "fromCache", false)
	slog.Debug("control.pits.fetch.result", resultFields...)
	respEnv := NewEnvelope(TypeResponse, env.ID, payload)
	respEnv.TraceID = traceID
	if err := safeWriteJSON(mu, ws, respEnv); err != nil {
		slog.Warn("control.pits.fetch.send.error", "path", f.Path, "requestId", env.ID, "traceId", traceID, "err", err)
		return
	}
	slog.Debug("control.pits.fetch.sent", "path", f.Path, "requestId", env.ID, "traceId", traceID, "status", resp.StatusCode, "bytes", len(body))
}

func (p *PitsClient) connect(ctx context.Context) (*websocket.Conn, *sync.Mutex, error) {
	dialer := websocket.Dialer{EnableCompression: true}
	hdr := http.Header{}
	if p.AuthToken != "" {
		hdr.Set("Authorization", "Bearer "+p.AuthToken)
	}
	u, err := url.Parse(p.CloudURL)
	if err != nil {
		return nil, nil, err
	}
	q := u.Query()
	q.Set("role", "pits")
	q.Set("version", "1")
	u.RawQuery = q.Encode()
	slog.Debug("control.pits.dial", "url", u.String(), "pitsId", p.PitsID)
	ws, _, err := dialer.DialContext(ctx, u.String(), hdr)
	if err != nil {
		return nil, nil, err
	}
	writeMu := &sync.Mutex{}
	if err := safeWriteJSON(writeMu, ws, NewEnvelope(TypeHello, "", Hello{ProtocolVersion: 1, PitsID: p.PitsID, SWVersion: "dev", Features: []string{"etag"}})); err != nil {
		_ = ws.Close()
		return nil, nil, err
	}
	slog.Debug("control.pits.hello_sent", "pitsId", p.PitsID)
	return ws, writeMu, nil
}

func (p *PitsClient) startPingLoop(ctx context.Context, ws *websocket.Conn, writeMu *sync.Mutex) func() {
	stop := make(chan struct{})
	var once sync.Once
	ticker := time.NewTicker(clientPingInterval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				slog.Debug("control.pits.ping.stop", "reason", "ctx")
				return
			case <-stop:
				slog.Debug("control.pits.ping.stop", "reason", "loop_exit")
				return
			case <-ticker.C:
				if err := safeWriteJSON(writeMu, ws, NewEnvelope(TypePing, "", nil)); err != nil {
					slog.Warn("control.pits.ping.error", "err", err)
					_ = ws.Close()
					return
				}
				slog.Debug("control.pits.ping.sent")
			}
		}
	}()
	return func() {
		once.Do(func() { close(stop) })
	}
}

func (p *PitsClient) consumeFrames(ctx context.Context, ws *websocket.Conn, writeMu *sync.Mutex) error {
	for {
		var env Envelope
		ws.SetReadDeadline(time.Now().Add(clientReadTimeout))
		if err := ws.ReadJSON(&env); err != nil {
			slog.Warn("control.pits.read.error", "err", err)
			return err
		}
		slog.Debug("control.pits.frame", "type", env.Type, "id", env.ID, "traceId", env.TraceID)
		p.handleEnvelope(writeMu, ws, env)
	}
}

func (p *PitsClient) handleEnvelope(writeMu *sync.Mutex, ws *websocket.Conn, env Envelope) {
	switch env.Type {
	case TypeHello:
		// ignore
	case TypeFetch:
		go p.handleFetch(writeMu, ws, env)
	case TypePing:
		pong := NewEnvelope(TypePong, env.ID, nil)
		pong.TraceID = env.TraceID
		_ = safeWriteJSON(writeMu, ws, pong)
	case TypePong:
		// ignore
	default:
		// ignore
	}
}

func ioReadAllCap(r io.Reader, max int64) ([]byte, error) {
	lr := &io.LimitedReader{R: r, N: max}
	var buf []byte
	tmp := make([]byte, 32*1024)
	for {
		n, err := lr.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if err == io.EOF {
			return buf, nil
		}
		if err != nil {
			return buf, err
		}
		if lr.N <= 0 {
			return buf, nil
		}
	}
}

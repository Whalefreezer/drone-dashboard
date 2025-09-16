package control

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
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
		HTTP:      &http.Client{Timeout: 5 * time.Second},
	}, nil
}

func (p *PitsClient) Start(ctx context.Context) {
	backoff := time.Second
	for {
		if ctx.Err() != nil {
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
	dialer := websocket.Dialer{}
	hdr := http.Header{}
	if p.AuthToken != "" {
		hdr.Set("Authorization", "Bearer "+p.AuthToken)
	}
	u, err := url.Parse(p.CloudURL)
	if err != nil {
		return err
	}
	q := u.Query()
	q.Set("role", "pits")
	q.Set("version", "1")
	u.RawQuery = q.Encode()
	ws, _, err := dialer.DialContext(ctx, u.String(), hdr)
	if err != nil {
		return err
	}
	defer ws.Close()
	// serialize all writes to this websocket
	var writeMu sync.Mutex
	// Send hello
	_ = safeWriteJSON(&writeMu, ws, NewEnvelope(TypeHello, "", Hello{ProtocolVersion: 1, PitsID: p.PitsID, SWVersion: "dev", Features: []string{"etag"}}))

	for {
		var env Envelope
		ws.SetReadDeadline(time.Now().Add(60 * time.Second))
		if err := ws.ReadJSON(&env); err != nil {
			var netErr net.Error
			if errors.As(err, &netErr) && netErr.Timeout() {
				if err := safeWriteJSON(&writeMu, ws, NewEnvelope(TypePing, "", nil)); err != nil {
					return err
				}
				continue
			}
			return err
		}
		switch env.Type {
		case TypeHello:
			// ignore
		case TypeFetch:
			go p.handleFetch(&writeMu, ws, env)
		case TypePing:
			_ = safeWriteJSON(&writeMu, ws, NewEnvelope(TypePong, env.ID, nil))
		case TypePong:
			// ignore
		default:
			// ignore
		}
	}
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
		_ = safeWriteJSON(mu, ws, NewEnvelope(TypeError, env.ID, Error{Code: "BAD_REQUEST", Message: "invalid fetch"}))
		return
	}
	if strings.ToUpper(f.Method) != "GET" && strings.ToUpper(f.Method) != "HEAD" {
		_ = safeWriteJSON(mu, ws, NewEnvelope(TypeError, env.ID, Error{Code: "DENIED", Message: "method not allowed"}))
		return
	}
	// basic allowlist: only /events, /httpfiles, root
	if !(f.Path == "/" || strings.HasPrefix(f.Path, "/events/") || strings.HasPrefix(f.Path, "/httpfiles/")) {
		_ = safeWriteJSON(mu, ws, NewEnvelope(TypeError, env.ID, Error{Code: "DENIED", Message: "path not allowed"}))
		return
	}
	// Build URL
	u := *p.FPVBase
	u.Path = f.Path
	req, _ := http.NewRequest("GET", u.String(), nil)
	// Prefer uncompressed to simplify hashing
	req.Header.Set("Accept-Encoding", "identity")
	if f.TimeoutMs > 0 {
		p.HTTP.Timeout = time.Duration(f.TimeoutMs) * time.Millisecond
	}
	resp, err := p.HTTP.Do(req)
	if err != nil {
		_ = safeWriteJSON(mu, ws, NewEnvelope(TypeError, env.ID, Error{Code: "INTERNAL", Message: err.Error()}))
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
	if f.IfNoneMatch != "" && f.IfNoneMatch == etag {
		_ = safeWriteJSON(mu, ws, NewEnvelope(TypeResponse, env.ID, Response{Status: http.StatusNotModified, Headers: map[string]string{"ETag": etag}}))
		return
	}
	// Headers
	hdrs := map[string]string{"ETag": etag}
	if ct != "" {
		hdrs["Content-Type"] = ct
	}
	payload := Response{Status: resp.StatusCode, Headers: hdrs, BodyB64: base64.StdEncoding.EncodeToString(body)}
	_ = safeWriteJSON(mu, ws, NewEnvelope(TypeResponse, env.ID, payload))
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

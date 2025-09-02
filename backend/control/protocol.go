package control

import "time"

// Message types
const (
    TypeHello    = "hello"
    TypeFetch    = "fetch"
    TypeResponse = "response"
    TypeError    = "error"
    TypePing     = "ping"
    TypePong     = "pong"
)

type Envelope struct {
    ID      string      `json:"id"`
    Type    string      `json:"type"`
    TS      int64       `json:"ts"`
    Payload interface{} `json:"payload"`
}

func NewEnvelope(t string, id string, payload interface{}) Envelope {
    return Envelope{ID: id, Type: t, TS: time.Now().UnixMilli(), Payload: payload}
}

type Hello struct {
    ProtocolVersion int      `json:"protocolVersion"`
    PitsID          string   `json:"pitsId,omitempty"`
    SWVersion       string   `json:"swVersion,omitempty"`
    Features        []string `json:"features,omitempty"`
    ServerTimeMs    int64    `json:"serverTimeMs,omitempty"`
}

type Fetch struct {
    Method      string            `json:"method"`
    Path        string            `json:"path"`
    IfNoneMatch string            `json:"ifNoneMatch,omitempty"`
    Headers     map[string]string `json:"headers,omitempty"`
    TimeoutMs   int               `json:"timeoutMs"`
}

type Response struct {
    Status  int               `json:"status"`
    Headers map[string]string `json:"headers"`
    BodyB64 string            `json:"bodyB64,omitempty"`
}

type Error struct {
    Code    string                 `json:"code"`
    Message string                 `json:"message"`
    Details map[string]interface{} `json:"details,omitempty"`
}


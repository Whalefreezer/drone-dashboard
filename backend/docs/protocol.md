# Cloud ↔ Pits Command Protocol (WS)

Overview

- Transport: WebSocket over TLS (`wss://`), JSON messages, optional per‑message
  compression.
- Pattern: Request/response with `id` correlation. One outstanding response per
  `id`.
- Versioning: `protocolVersion` in handshake. Reject incompatible versions.

Handshake

- Client (pits) connects to `wss://cloud-host/control?role=pits&version=1` with
  headers:
  - `Authorization: Bearer <token>` or mTLS client cert.
  - Optional `X-Pits-Id: <uuid>` for stable identity.
- Server (cloud) replies with a `hello` message; pits sends its `hello` with
  capabilities.

Message Envelope

{ "id": "uuid", "type": "hello|fetch|response|error|ping|pong", "ts":
1712345678901, "payload": { ... } }

Hello

- From cloud to pits:
  - { type: "hello", payload: { protocolVersion: 1, serverTimeMs } }
- From pits to cloud:
  - { type: "hello", payload: { protocolVersion: 1, pitsId, swVersion, features:
    ["etag","gzip"] } }

Fetch Command (cloud ➜ pits)

payload

{ "method": "GET", // restricted to safe allowlisted methods "path":
"/api/whatever", // must match allowlist "ifNoneMatch": "\"etag\"", // optional;
previous pits-computed ETag "headers": { // forwarded to fpvtrackside (filtered;
optional) "Accept-Encoding": "gzip" }, "timeoutMs": 8000 }

Notes

- Only allow safe methods (GET/HEAD) unless explicitly permitted.
- Pits maps `path` to `http://localhost:8080` (or configured `-fpvtrackside`).
- Pits always performs a fresh origin fetch and computes a strong ETag (e.g.,
  SHA‑256 of the uncompressed body or canonical JSON). If `ifNoneMatch` matches
  the computed ETag, pits returns 304 with no body.
- Strip/override hop‑by‑hop headers; cap `timeoutMs` and size limits.

Response (pits ➜ cloud)

payload

{ "status": 200, "headers": { "Content-Type": "application/json", "ETag":
"\"etag\"", // computed by pits "Cache-Control": "max-age=5" }, "bodyB64":
"<base64>" // omit for 304; can be empty for HEAD }

Error (either direction)

payload

{ "code": "UNAUTHORIZED|TIMEOUT|DENIED|BAD_REQUEST|INTERNAL", "message":
"human-readable", "details": { } }

Keepalive

- Cloud may send `ping` every N seconds; pits replies with `pong`.
- Consider TCP keepalives at the socket layer as well.

Correlation & Ordering

- `id` is unique per request. Responses must echo the `id`.
- Commands are independent; concurrency governed by pits’ worker pool.

Backpressure & Limits

- Cloud sets concurrency caps per connection.
- Pits rejects commands over the concurrency or size limit with `error`.

Security & Validation

- Strictly validate `path` against allowlist patterns (e.g., `/api/**`).
- Sanitize headers; explicitly forward a safe subset.
- Log `id`, `pitsId`, `path`, `status`, latency; never log secrets.

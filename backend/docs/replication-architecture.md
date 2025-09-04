# Pits ↔ Cloud Control Link: Architecture Options

Goals

- Run two instances of the same backend: one in the pits (offline‑first) and one
  in the cloud (Internet scale for 100+ users).
- Avoid inbound connectivity to pits: no static IP, no port forwarding.
- Cloud can send commands to pits to fetch data from local `fpvtrackside`
  endpoints and return JSON/HTML.
- Minimize bandwidth over pits’ uplink via caching (ETag) and compression.
- Keep the pits instance fully functional offline (no cloud dependency for local
  dashboards).

Constraints & Assumptions

- Same binary on both sides; behavior driven by config/flags.
- Cloud side is reachable on public Internet and can terminate TLS.
- Data returned is HTTP content from fpvtrackside (mostly JSON/HTML,
  occasionally other types). We proxy transparently.

Recommended Approach (Phase 1)

- Bi‑directional WebSocket control/data channel from pits ➜ cloud.
  - Pits dials out to `wss://cloud-host/control` and maintains a persistent
    connection (reconnect with backoff).
  - Cloud authenticates pits using a token or mTLS; authorizes commands per
    allowlist.
  - Cloud DOES NOT directly call FPVTrackside. Instead, in cloud mode the code
    paths that currently use `FPVClient` are swapped to a `RemoteFPVClient` that
    sends “fetch” commands over WS to the pits.
  - Pits, upon each `fetch` command, performs a fresh local HTTP request to
    `fpvtrackside` and computes an ETag from the response body. If the cloud
    includes `If-None-Match` and it matches the newly computed ETag, pits
    returns `304 Not Modified` with no body.
  - Apply compression on the WS messages; avoid double‑compression if origin
    returns compressed content.

Why WebSocket first

- Simple, well‑supported, and fits bidirectional request/response with
  correlation IDs.
- Easy scaling (stickiness by connection) and straightforward to add auth and
  rate‑limits.
- No NAT traversal issues since pits only makes outbound connections.

Alternative Options (Phase 2+ / Tradeoffs)

1. MQTT Broker

- Pros: Durable messaging, QoS, retained messages, large scale, topic ACLs.
- Cons: Adds a broker dependency; binary payload framing to design; more ops
  overhead.

2. gRPC Bidirectional Streaming

- Pros: Strong typing, backpressure, multiplexing, good perf over HTTP/2.
- Cons: Slightly heavier client/server implementation vs WS; infra/ops comfort
  needed.

3. WebRTC Data Channel

- Pros: Efficient, potential P2P; built‑in congestion control.
- Cons: Requires signaling server; added complexity and dependency on STUN/TURN.

4. HTTPS Long‑Polling / SSE Fallback

- Pros: Works almost anywhere; easy to debug.
- Cons: Less efficient, more latency; harder for high‑throughput control flows.

Security Model

- Identity: Issue each pits instance a token (JWT) or device certificate (mTLS).
- Authorization: Cloud restricts allowed endpoints/prefixes that pits can fetch
  from `fpvtrackside`.
- Transport: TLS on the cloud endpoint. For mTLS, client cert presented by pits.
- Rate limiting & quotas: Per connection and per command type; backpressure on
  large bodies.
- Input validation & sanitization: Strictly validate requested
  method/path/headers against allowlist; strip hop‑by‑hop headers.

Caching & Bandwidth

- Pits‑computed ETag: FPVTrackside doesn’t emit ETags. Pits computes a
  deterministic strong validator (e.g., SHA‑256 of the uncompressed body or
  canonicalized JSON) on every fetch.
- 304 flow: Cloud maintains cache per resource; includes `If-None-Match`. If
  pits computes the same ETag, it replies `304` (no body), saving uplink
  bandwidth.
- Compression: Prefer compression on the WS message from pits➜cloud. For LAN
  origin fetches, disable or ignore origin compression to compute ETag on the
  raw body.
- TTL fallback: Only for endpoints where hashing is too expensive; otherwise
  prefer validator‑based revalidation.

Offline Behavior

- Pits UI works standalone against local `fpvtrackside` even with no Internet.
- Cloud shows “stale” data with last updated timestamps when pits link is down.
- Reconnect with exponential backoff and jitter.

Cloud Behavior (no direct origin calls)

- Cloud replaces direct FPVTrackside reads with WS requests to pits. All
  Event.json, Race.json, Results.json, etc., flow from pits over WS.
- End‑users access the cloud instance (PocketBase API + static frontend). The
  cloud’s data is populated via WS fetches, not direct origin calls.

Scaling the Cloud Side

- Single instance: Maintain WS connections in‑process; in‑memory request
  routing.
- Multi‑instance: Use a shared broker/bus (Redis, NATS) to route commands to the
  right worker holding the WS; or keep sticky load‑balancer affinity on WS.
- Observability: Metrics for connection counts, command latency, cache hit/miss,
  bytes saved via 304s.

Operational Concerns

- Versioning: Include protocol version in the handshake to detect
  incompatibilities.
- Limits: Cap max body size; stream large bodies in chunks if needed.
- Auditing: Log command invocations, results, and auth identity.
- Health: Cloud exposes per‑connection status; pits exposes last‑command/success
  metrics.

Next Steps to Implement

1. Add `--mode` flag: `pits` or `cloud` (defaults to current standalone behavior
   if omitted).
2. Cloud: Add `/control` WS endpoint with auth; route messages by `connectionId`
   and expose a `RemoteFPVClient` used by ingest paths.
3. Pits: Add WS client that connects to cloud, authenticates, and handles
   commands. On each fetch, call local FPVTrackside, compute ETag, and reply
   200/304.
4. Protocol: JSON with `id`, `type`, `fetch` payload and `If-None-Match`;
   response includes `ETag`. See `protocol.md`.
5. ETag: Pits computes strong ETag per response; cloud caches by ETag and
   includes `If-None-Match` on subsequent fetches.
6. Config: See `pits-config.md` and `cloud-config.md` for flags/env.

# Cloud Instance Configuration

Role & Summary

- Publicly reachable instance serving all end‑users and coordinating control links to pits nodes.
- Does not call FPVTrackside directly. In cloud mode, replaces `FPVClient` calls with WS requests to the pits instance and caches responses by the pits‑computed ETag.

Proposed Flags/Env

- `-mode=cloud` or `MODE=cloud`
- `-port=3000` (existing)
- `-control-path=/control`
- `-control-auth-secret=...` (HMAC for JWT) or `-mtls-ca=/path/ca.pem`
- `-allowlist=/api/**,/static/**` (comma‑separated patterns)
- `-max-connections=5000 -per-conn-concurrency=8`
- `-cache-max-entries=10000 -cache-max-bytes=268435456` (256MB)
- `-metrics-bind=:9090`

Behavior

- Accept authenticated WS connections from pits; map `pitsId` to connection.
- Replace direct FPVTrackside reads with WS `fetch` to pits (RemoteFPVClient) for Event.json, Race.json, Results.json, etc.
- Keep an in‑process cache keyed by `{pitsId, method, path}` with ETag validators from pits to minimize uplink bytes.
- End‑users consume PocketBase APIs and static frontend on the cloud; there is no direct FPVTrackside proxy for users.

Load Balancing & Scaling

- Single node: terminate TLS and keep WS in the same process.
- Multi node: keep sticky sessions for WS OR share routing state via Redis/NATS; optional CDN for static content.
- Rate‑limit per pitsId and per user IP.

Docker Compose (example)

version: '3.8'
services:
  cloud:
    image: ghcr.io/yourorg/drone-dashboard:latest
    command: ["/app/backend", "-mode=cloud", "-port=3000", "-control-auth-secret=${CONTROL_SECRET}"]
    environment:
      - CONTROL_SECRET=${CONTROL_SECRET}
    ports:
      - "80:3000"
    restart: unless-stopped

Security Notes

- Prefer mTLS for pits identity when feasible; otherwise sign short‑lived JWTs with rotation.
- Maintain an allowlist for methods/paths; log and reject anything else.
- Scrub hop‑by‑hop and sensitive headers; cap body sizes.

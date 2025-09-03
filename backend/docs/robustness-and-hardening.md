# Robustness, Hardening, and Operability

This document outlines the main fragility risks in the pits↔cloud design and concrete steps to make it resilient, observable, and safe at race scale.

Goals

- Minimize data staleness and user-visible failures even with flaky Internet at the pits.
- Bound resource usage (CPU, memory, bandwidth) under load and during partial failures.
- Ensure security controls are explicit and verifiable.
- Keep operability simple for on‑site staff: clear status, easy recovery.

Key Risks & Failure Modes

- Connectivity: WS drops, NAT/reconnect flapping, long RTT to cloud, captive portals.
- Protocol: message loss or duplication, request/response mismatch, version drift.
- Caching: ETag mismatch due to canonicalization changes; cache poisoning on bad payloads.
- Content variance: endpoints returning empty bodies (e.g., Results.json) or HTML error pages.
- Resource pressure: many concurrent cloud requests fan‑out to pits; large payloads; slow origin.
- Security: path escapes, method abuse, auth leakage, replay of control messages.
- Operability: opaque failures; no metrics/alerts; unclear admin recovery actions.

Defensive Design Recommendations

- Timeouts & Retries
  - Pits: set per‑fetch timeouts (3–8s) with conservative retries only for transient network errors.
  - Cloud: set an overall deadline per WS fetch; surface timeouts as 5xx to callers and avoid infinite waits.
  - Use exponential backoff with jitter for WS reconnects.

- Concurrency & Backpressure
  - Cap in‑flight fetches per pits connection (configurable, e.g., 8–16); return `error{code: "BUSY"}` when saturated.
  - Queue on cloud side with bounded size and shed load when overwhelmed.
  - Consider a small worker pool in pits to stop thundering herds on slow endpoints.

- Size & Rate Limits
  - Enforce max body size (e.g., 5–8MB) in pits; reject oversize with `error{code: "TOO_LARGE"}`.
  - Rate‑limit per pitsId on cloud; optionally per user IP for public endpoints.

- Protocol Hardening
  - Version negotiation: include `protocolVersion` in hello; reject incompatible clients.
  - Correlation IDs: ensure uniqueness; guard against reusing stale IDs after reconnects.
  - Replay protection: ignore responses for unknown or expired IDs.
  - Strict allowlist: only `GET/HEAD` and specific paths (`/`, `/events/**`, `/httpfiles/**`), configurable via flags.
  - Input filtering: strip hop‑by‑hop headers; normalize path to avoid `..` escapes.

- Caching & ETag
  - Canonicalization: keep a stable JSON canonicalization routine; changing it invalidates ETags and may spike bandwidth.
  - Validation order: unmarshal first, cache second (already implemented) to avoid caching bad payloads.
  - TTL fallback: allow optional TTL for specific slow endpoints if hashing becomes costly under load.
  - Cache controls: add admin endpoints to purge keys and view cache stats.

- Content Robustness
  - Lenient JSON: treat empty bodies as empty arrays/maps for list endpoints (implemented via `unmarshalLenient`).
  - Content‑type checks: warn if `Content-Type` is not expected for JSON paths; avoid caching HTML error pages.

- Security
  - Auth: prefer JWT with expiry/rotation or mTLS at the reverse proxy; never hardcode tokens.
  - Secrets: only via env/flags; avoid logging credentials. Mask sensitive headers in logs.
  - Audit: log `pitsId`, path, status, latency, and error codes; exclude bodies.

- Observability
  - Metrics (Prometheus):
    - control_connections{state}
    - ws_roundtrip_ms p50/p90/p99
    - fetch_in_flight, fetch_queue_depth
    - cache_hits, cache_misses, cache_bytes_saved
    - errors_by_code, timeouts, too_large, denied
  - Health endpoints:
    - Cloud: `/healthz` (up, connections), `/readyz` (queue under thresholds).
    - Pits: `/healthz` (ws connected, last success timestamp).
  - Structured logs with correlation IDs.

- Operations & Recovery
  - Admin controls:
    - Force reconnect WS; pause/resume command handling per pits.
    - Purge cache entries; toggle allowlist entries at runtime.
  - Backups: document PocketBase `pb_data` backup/restore; enable periodic backups in cloud.
  - Rollouts: include `protocolVersion` gating to allow canary pits upgrades.

- Load & Failure Testing
  - Unit tests for `unmarshalLenient`, hashing, and ETag round‑trips.
  - Integration tests: simulate pits with an in‑process WS and mock FPVTrackside; validate 200/304 paths and caching behavior.
  - Chaos drills: drop WS randomly; inject latency and packet loss; ensure graceful degradation and auto‑recovery.
  - Fuzzing: feed malformed JSON/HTML into the decoder path to confirm no panics and no cache poisoning.

- Scalability & Topology
  - Multi‑pits support: key caches and routing by `{pitsId, path}`; add UI to switch the active pits for the cloud instance.
  - Multi‑cloud replicas: use sticky sessions for WS or a shared registry (Redis/NATS) to route fetches to the right node.

Near‑Term Action Items

1) Add configurable limits: `-per-conn-concurrency`, `-max-body-bytes`, `-fetch-timeout` (both sides).
2) Add Prometheus metrics and `/healthz` endpoints.
3) Add JWT auth with expiry for `/control` and rotate secrets.
4) Add admin ops: cache purge, allowlist config, pause/resume, and connection status page.
5) Add integration tests for WS fetch and cloud cache behavior, including empty Results.json.
6) Add optional TTL per path for endpoints where hashing is expensive.

Longer‑Term Improvements

- Consider gRPC for stronger typing and builtin backpressure if complexity grows.
- Move to a shared message bus for multi‑cloud scaling while retaining WS as the pits transport.
- Explore CBOR for compact payloads and faster parsing if CPU bound.
- Formalize a JSON schema for each endpoint and run validation for early detection of upstream changes.

Appendix: Current Safeguards Implemented

- Outbound‑only pits WS (no port forwarding).
- ETag computed at pits from canonicalized JSON or raw bytes.
- Cloud cache keyed by `{pitsId, method, path}`.
- Lenient JSON parsing; empty payloads for list endpoints do not error.
- Cache updated only after successful decode to avoid poisoning.
- Allowlist enforced at pits; 8MB body cap; per‑request timeouts.

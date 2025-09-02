# Pits Instance Configuration

Role & Summary

- Runs next to `fpvtrackside` on the local network, serving the local dashboard offline.
- Establishes an outbound WS control link to the cloud so it can proxy specific `fpvtrackside` endpoints on demand.

Proposed Flags/Env

- `-mode=pits` or `MODE=pits`
- `-fpvtrackside=http://localhost:8080` (existing)
- `-cloud-url=wss://cloud.example.com/control` or `CLOUD_URL=...`
- `-auth-token=...` or `-mtls-cert=/path/cert.pem -mtls-key=/path/key.pem`
- `-pits-id=<uuid>` (optional; otherwise generated and persisted)
- `-max-concurrent-commands=8`
- `-max-body-bytes=5242880` (5MB)
- `-retry-base=2s -retry-max=60s` (exponential backoff)

Behavior

- On boot, start HTTP server for local users (offline‑first), and also start WS client to cloud.
- Maintain connection with backoff and jitter; expose health metrics.
- Only execute commands that match allowlisted methods/paths.
- For each `fetch` command: perform a fresh local HTTP request to FPVTrackside, compute a deterministic ETag from the response body, and:
  - If `ifNoneMatch` equals the computed ETag, respond `304 Not Modified` (no body).
  - Otherwise respond `200 OK` with headers including the computed `ETag` and the body.

Systemd Example

[Unit]
Description=Drone Dashboard (Pits)
After=network-online.target
Wants=network-online.target

[Service]
Environment=MODE=pits
Environment=FPVTRACKSIDE=http://127.0.0.1:8080
Environment=CLOUD_URL=wss://cloud.example.com/control
Environment=AUTH_TOKEN=replace-with-secret
ExecStart=/usr/local/bin/drone-dashboard -mode=${MODE} -fpvtrackside=${FPVTRACKSIDE} -cloud-url=${CLOUD_URL} -auth-token=${AUTH_TOKEN}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target

Operational Notes

- Keep clocks roughly in sync (NTP) for logs and token validity.
- Prefer wired or strong Wi‑Fi for reliability.
- Monitor logs for `DENIED` errors indicating allowlist rejections.

ETag Computation

- Default: SHA‑256 over uncompressed bytes. For JSON, consider canonicalizing before hashing for stability.
- Configure via flags if needed (e.g., `-etag-hash=sha256`, `-etag-json-canonical=true`).

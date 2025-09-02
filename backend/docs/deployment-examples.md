# Deployment Examples

Pits (Bare Metal with systemd)

1) Copy binary to `/usr/local/bin/drone-dashboard`.
2) Put a token in `/etc/drone-dashboard/token` with `600` perms.
3) Create `drone-dashboard.service` (see `pits-config.md`).

Cloud (Docker Compose)

- Compose file example in `cloud-config.md`.
- Put `CONTROL_SECRET` in an `.env` file; mount TLS certs via reverse proxy (Caddy, Nginx, Traefik).

TLS Termination

- Option A: Terminate at reverse proxy and forward to app over loopback.
- Option B: App terminates TLS directly (supply `-tls-cert`/`-tls-key`).

Kubernetes (Sketch)

- Deploy `Deployment` for app; `Service` type `LoadBalancer`.
- Use Ingress for TLS; enable sticky sessions for WS or route WS consistently.
- Add `ConfigMap` for allowlist and `Secret` for control auth.

Observability

- Expose Prometheus metrics: connections, round‑trip latency, cache hit ratio, bytes saved (304), error rates.
- Centralized logs with connection IDs and pits IDs.


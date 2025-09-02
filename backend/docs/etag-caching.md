# ETag & Caching Strategy

Objectives

- Reduce pits uplink bandwidth while keeping cloud’s data fresh for many users.
- Use validator-based revalidation with ETags computed at the pits side.

End‑to‑End Flow (Origin has no ETags)

1) A cloud component needs `Event.json`/`Race.json`/etc. (e.g., ingest refresh).
2) Cloud checks its cache. If cached with `ETag=E`, it issues a WS `fetch` including `ifNoneMatch: E` to pits.
3) Pits fetches from local FPVTrackside (fresh every time), computes a deterministic ETag from the body.
4) If the computed ETag equals `E`, pits returns `304 Not Modified` with no body. Cloud reuses the cached body.
5) If different, pits returns `200 OK` with `ETag=E'` and the body; cloud updates its cache and proceeds.

Headers

- `ETag`: Strong validator computed by pits per response.
- `Cache-Control`, `Expires`: Optional hints propagated from pits policy (not origin).
- `Content-Type`: Derived from origin content type.

ETag Algorithm (at Pits)

- For JSON endpoints: Canonicalize JSON (sorted keys, no whitespace), then compute `ETag = "W/\"sha256:<hex>\""` or strong `"\"sha256:<hex>\""`.
- For non‑JSON: Compute SHA‑256 over the raw uncompressed bytes.
- Avoid including transport encodings (gzip) in the hash; request uncompressed from origin if practical on LAN.

Compression

- Origin fetch (LAN): Prefer uncompressed to simplify hashing and avoid CPU overhead.
- WS (pits➜cloud): Enable per‑message compression; skip if payload already compressed.

Cache Keys

- Key = `{pitsId}:{method}:{path}` (headers generally excluded since pits controls normalization).

Invalidation

- Prefer validator‑based via ETag; add TTL only for exceptionally heavy resources where hashing is costly.
- Optional admin purge for specific keys.

Edge Cases

- Large payloads: Stream or chunk if needed; otherwise cap max body size.
- Non‑idempotent endpoints: Disallow or bypass caching entirely.

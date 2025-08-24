## PocketBase Migrations and Backend Wiring

This document outlines how we will define and register PocketBase migrations in the Go backend and wire them into the existing `main.go` server lifecycle.

Reference: [PocketBase Go Migrations](https://pocketbase.io/docs/go-migrations/)

### Objectives
- Define initial collections to support normalized data model (see `pocketbase-data-model.md`).
- Register migrations and ensure they run automatically on server start.
- Enable generation of snapshot migrations during development.

### Directory layout

```
backend/
  main.go
  migrations/
    1700000000_init_collections.go
    1700001000_indexes.go
```

The `migrations` package is imported anonymously from `main.go` to register the migration steps at build time.

### Wiring in main.go

In `backend/main.go`:
1) Register the migrate command before `app.Start()`:

```go
import (
  // ... existing imports ...
  "os"
  "github.com/pocketbase/pocketbase/plugins/migratecmd"
  _ "drone-dashboard/backend/migrations"
)

func main() {
  // ... flag parsing ...

  app := pocketbase.New()

  // Enable migrations and optional automigrate in dev (go run heuristic)
  isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
  migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
    Automigrate: isGoRun,
  })

  // existing OnServe() hooks and Start()
}
```

Notes:
- We already import `strings`; add `os` if not present.
- `_ "drone-dashboard/backend/migrations"` ensures compiled‑in migration registration.

### Initial migration: create collections

The first migration creates base collections aligned with the data model: `events`, `rounds`, `pilots`, `channels`, `tracks`, `races`, `pilotChannels`, `laps`, `detections`, `gamePoints`, `results`.

Each collection defines fields with appropriate types, relations, and required flags. Example (illustrative snippet only):

```go
package migrations

import (
  "github.com/pocketbase/pocketbase/core"
  m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
  m.Register(func(app core.App) error {
    // create collections and fields, e.g.:
    // events := core.NewBaseCollection("events")
    // events.Fields.Add(&core.TextField{Name: "sourceId", Required: true, Max: 64})
    // events.Fields.Add(&core.TextField{Name: "name", Required: true, Max: 200, Presentable: true})
    // ... add other fields and indexes ...
    // return app.Save(events)
    return nil
  }, func(app core.App) error {
    // optional down: delete collections
    return nil
  })
}
```

We’ll implement the concrete field set per the mapping. Indexes that require names can be created in a follow‑up migration.

### Indexes migration

Define named indexes as separate migration to keep concerns clear. Example:

```go
func init() {
  m.Register(func(app core.App) error {
    // app.DB().NewQuery("CREATE UNIQUE INDEX ux_events_source ON events(source, sourceId)").Execute()
    // app.DB().NewQuery("CREATE INDEX ix_rounds_event_order ON rounds(event, \"order\")").Execute()
    return nil
  }, nil)
}
```

We can also add unique constraints using PocketBase collection indexes when using the high‑level API. Raw SQL works for advanced cases.

### Development workflow

- During development, with `go run`, `Automigrate` can generate collection snapshots when using the Dashboard; commit resulting files under `backend/migrations/`.
- To generate a blank migration: `go run . migrate create "short_description"` (run from `backend/`).
- To snapshot current collections: `go run . migrate collections`.
- To sync migration history after squashing files: `go run . migrate history-sync`.

### Startup behavior

- On `app.Start()` the PocketBase server applies unapplied migrations automatically.
- Admin UI is available at `/_/` (already wired in our `main.go`).

### Validation and security

- Use PocketBase collection rules to scope read/write (e.g., public read for derived stats only; admin write for ingestion).
- For now, we’ll default to admin‑only writes and read‑only API where appropriate; rule details to be finalized after ingestion design.

### Next steps

- Implement `1700000000_init_collections.go` matching the model in `pocketbase-data-model.md`.
- Implement `1700001000_indexes.go` with unique and performance indexes.
- Wire `main.go` imports and `migratecmd.MustRegister` as described.



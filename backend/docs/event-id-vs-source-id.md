# Event ID vs Event Source ID - Architecture Documentation

## Problem Statement

There is significant confusion in the codebase between **Event ID** (PocketBase internal ID) and **Event Source ID** (external system identifier). This confusion manifests in:

1. **Inconsistent variable naming** - `eventId` variable can mean either internal or external ID
2. **Mixed usage patterns** - Some functions expect source IDs, others expect internal IDs
3. **Race conditions** - `runDiscovery()` tries to create database targets before ensuring the event exists in the database

## Key Concepts

### Event Source ID (`eventSourceId`)
- **What**: The identifier used by the external FPVTrackside system
- **Usage**: Required for all external API calls (`/events/{eventSourceId}/...`)
- **Example**: `"abc123-def456-ghi789"`
- **Storage**: Stored in PocketBase as `events.sourceId` field

### Event ID (`eventId`)
- **What**: PocketBase's internal auto-generated ID for the event record
- **Usage**: Required for database relations (foreign keys)
- **Example**: `"pbc_1234567890"`
- **Storage**: PocketBase's `events.id` field

## Current Flow Issues

### Problem in `runDiscovery()`

```go
func (m *Manager) runDiscovery() {
    // 1. Try to get existing PocketBase event ID
    eventId := m.findCurrentEventPBID() // This is PocketBase ID

    // 2. Get or fetch event source ID
    eventSourceId := // ... fetch from external system

    // 3. Try to get PocketBase ID if it exists
    if pbid, err := m.Service.Upserter.GetExistingId("events", eventSourceId); err == nil {
        eventId = pbid  // Now eventId is PocketBase ID again
    }

    // 4. PROBLEM: We haven't ingested the event yet, so GetExistingId fails
    // 5. We call FetchEvent but don't IngestEventMeta

    // 6. PROBLEM: upsertTarget is called with empty eventId
    m.upsertTarget("event", eventSourceId, eventId, ...) // eventId might be empty!
}
```

### Issues Identified

1. **Race Condition**: `upsertTarget` is called before `IngestEventMeta`, so the event may not exist in the database yet
2. **Empty Foreign Keys**: When `eventId` is empty, the `ingest_targets` records are created without proper foreign key relationships
3. **Variable Confusion**: The same variable `eventId` holds different types of IDs at different times

## Correct Flow (Proposed)

```go
func (m *Manager) runDiscovery() {
    // 1. Get event source ID from external system
    eventSourceId, err := m.Service.Client.FetchEventSourceId()
    if err != nil {
        return
    }

    // 2. Fetch event data to validate it exists and get race information
    events, err := m.Service.Client.FetchEvent(eventSourceId)
    if err != nil || len(events) == 0 {
        return
    }
    eventData := events[0]

    // 3. Ingest event metadata FIRST to ensure it exists in database
    // Use the already-fetched event data to avoid duplicate API call
    if err := m.Service.IngestEventMetaFromData(eventData); err != nil {
        slog.Warn("Failed to ingest event meta", "error", err)
        return
    }

    // 4. Now get the PocketBase event ID (guaranteed to exist)
    eventPBID, err := m.Service.Upserter.GetExistingId("events", eventSourceId)
    if err != nil {
        return
    }

    // 5. Create targets with proper PocketBase ID for relations
    now := time.Now()
    m.upsertTarget("event", eventSourceId, eventPBID, m.Cfg.FullInterval, now)
    m.upsertTarget("pilots", eventSourceId, eventPBID, m.Cfg.FullInterval, now)
    // ... etc
}
```

## Function Parameter Conventions

### Functions that take Event Source ID
These functions need the external system's identifier for API calls:

```go
// External API calls - require source ID
func (c *FPVClient) FetchEvent(eventSourceId string) (EventFile, error)
func (c *FPVClient) FetchPilots(eventSourceId string) (PilotsFile, error)
func (c *FPVClient) FetchRounds(eventSourceId string) (RoundsFile, error)

// Ingestion functions that call external APIs - take source ID
func (s *Service) IngestEventMeta(eventSourceId string) error
func (s *Service) IngestPilots(eventSourceId string) error
func (s *Service) IngestRounds(eventSourceId string) error
func (s *Service) Snapshot(eventSourceId string) error
```

### Functions that take PocketBase Event ID
These functions work with database relations:

```go
// Database operations - require PocketBase ID
func (m *Manager) upsertTarget(type, sourceId, eventPBID string, ...) // eventPBID is PocketBase ID
func (m *Manager) pruneOrphans(eventPBID string, ...) // eventPBID is PocketBase ID
func (m *Manager) findCurrentEventPBID() string // Returns PocketBase ID
```

### Functions that convert between ID types

```go
// Conversion utilities
func (u *Upserter) GetExistingId(collection, sourceId string) (pbId string, error) // sourceId -> pbId
func (m *Manager) resolveEventSourceIdFromTarget(rec *core.Record) string // pbId -> sourceId
```

## Recommended Variable Naming Convention

To reduce confusion, adopt these naming conventions:

```go
// ✅ GOOD - Clear naming
eventSourceId := "abc123-def456"  // External system ID
eventPBID := "pbc_1234567890"    // PocketBase internal ID

// ❌ AVOID - Confusing naming
eventId := // Could be either type - ambiguous!
```

## Migration Strategy

### Phase 1: Fix `runDiscovery()` Critical Path

1. **Immediate Fix**: Modify `runDiscovery()` to ingest event metadata before creating targets
2. **Add Logging**: Add debug logs to track ID conversions
3. **Validate**: Ensure all targets are created with valid foreign keys

### Phase 2: Systematic Variable Renaming

1. **Audit Functions**: Catalog all functions and their parameter expectations
2. **Rename Variables**: Change `eventId` to `eventSourceId` or `eventPBID` as appropriate
3. **Update Comments**: Add clarifying comments for ID type expectations
4. **Update Tests**: Ensure test code follows new naming conventions

### Phase 3: Add Type Safety (Future)

Consider creating distinct types for different ID types:

```go
type EventSourceID string
type EventPBID string

func (id EventSourceID) String() string { return string(id) }
func (id EventPBID) String() string { return string(id) }
```

## Testing Considerations

When fixing this issue, ensure:

1. **Database Integrity**: All foreign key relationships are valid
2. **API Compatibility**: External API calls continue to work
3. **Race Conditions**: Event ingestion happens before target creation
4. **Error Handling**: Proper handling when events don't exist in either system

## Performance Optimization

### Eliminating Duplicate API Calls

The initial implementation had an inefficiency where `FetchEvent` was called twice:

1. Once in `runDiscovery()` to validate the event exists and get race information
2. Again inside `IngestEventMeta()` to fetch the same event data for ingestion

**Solution**: Created `IngestEventMetaFromData()` that accepts pre-fetched event data, eliminating the duplicate API call.

```go
// Before: Two API calls
events, err := m.Service.Client.FetchEvent(eventSourceId)  // Call #1
err := m.Service.IngestEventMeta(eventSourceId)           // Call #2 (duplicate)

// After: One API call
events, err := m.Service.Client.FetchEvent(eventSourceId)  // Call #1 only
eventData := events[0]
err := m.Service.IngestEventMetaFromData(eventData)       // Uses cached data
```

This optimization reduces network overhead and improves performance, especially important for the scheduler that runs frequently.

## Related Issues

- Foreign key constraint violations in `ingest_targets` table
- Inconsistent data in scheduler targets
- Race conditions during initial event discovery
- Confusion in log messages and error reporting
- Performance impact from duplicate API calls

## Comprehensive Audit Results

After analyzing the entire backend codebase, here are the remaining sources of confusion that need to be addressed:

### 1. Function Parameter Confusion

**Functions that take Event Source ID (for external API calls):**
```go
// Client functions - these correctly expect source IDs
func (c *FPVClient) FetchEvent(eventId string) (EventFile, error)           // ✅ Correct usage
func (c *FPVClient) FetchPilots(eventId string) (PilotsFile, error)         // ✅ Correct usage  
func (c *FPVClient) FetchRounds(eventId string) (RoundsFile, error)         // ✅ Correct usage
func (c *FPVClient) FetchRace(eventId, raceId string) (RaceFile, error)     // ✅ Correct usage
func (c *FPVClient) FetchResults(eventId string) (ResultsFile, error)       // ✅ Correct usage

// Service functions - these correctly expect source IDs
func (s *Service) IngestEventMeta(eventId string) error                     // ✅ Correct usage
func (s *Service) IngestPilots(eventId string) error                        // ✅ Correct usage
func (s *Service) IngestChannels(eventId string) error                      // ✅ Correct usage
func (s *Service) IngestRounds(eventId string) error                        // ✅ Correct usage
func (s *Service) IngestRace(eventId, raceId string) error                  // ✅ Correct usage
func (s *Service) IngestResults(eventId string) (int, error)                // ✅ Correct usage
func (s *Service) Snapshot(eventId string) error                            // ✅ Correct usage
func (s *Service) Full(eventId string) (FullSummary, error)                 // ✅ Correct usage
```

**Functions that take Event Source ID but have confusing parameter names:**
```go
// These functions expect source IDs but parameter name suggests internal ID
func (s *Service) setEventAsCurrent(eventId string) error                   // ❌ Confusing - expects source ID
```

### 2. Variable Naming Confusion

**In `setEventAsCurrent()`:**
```go
func (s *Service) setEventAsCurrent(eventId string) error {
    // ...
    for _, event := range allEvents {
        // Check if this is the target event by comparing sourceId
        isCurrent := event.GetString("sourceId") == eventId  // eventId is actually source ID!
    }
}
```

**In `Full()` function:**
```go
func (s *Service) Full(eventId string) (FullSummary, error) {
    // eventId parameter is actually source ID (used for API calls)
    events, err := s.Client.FetchEvent(eventId)  // ✅ Correct usage
    // ...
    if err := s.IngestRace(string(e.ID), string(raceID)); err != nil {
        // But here we use e.ID (source ID) instead of eventId parameter
    }
}
```

### 3. Log Message Confusion

**Inconsistent log field names:**
```go
// Some logs use "eventId" for source ID
slog.Debug("ingest.event.start", "eventId", eventId)  // eventId is source ID

// Some logs use "eventSourceId" for source ID  
slog.Debug("ingest.event.start", "eventSourceId", eventSourceId)  // Clear naming

// Some logs use "eventId" for PocketBase ID
slog.Info("ingest.setEventAsCurrent.done", "eventId", eventId, "totalEvents", len(allEvents))
```

### 4. Struct Field Confusion

**In `FullSummary` struct:**
```go
type FullSummary struct {
    EventId string `json:"eventId"`  // ❌ Ambiguous - could be either type
}
```

### 5. API Route Confusion

**In handlers.go:**
```go
// Routes use {eventId} but this is actually source ID
se.Router.POST("/ingest/events/{eventId}/snapshot", ...)
se.Router.POST("/ingest/events/{eventId}/race/{raceId}", ...)
se.Router.POST("/ingest/events/{eventId}/results", ...)
se.Router.POST("/ingest/events/{eventId}/full", ...)
```

### 6. Comment Confusion

**In types.go:**
```go
// GET /events/{eventId}/Event.json  // ❌ Comment suggests internal ID but it's source ID
// GET /events/{eventId}/Pilots.json // ❌ Comment suggests internal ID but it's source ID
```

## Implementation Status

### ✅ Phase 1: Critical Function Renames - COMPLETED
1. ✅ Renamed `setEventAsCurrent(eventId string)` to `setEventAsCurrent(eventSourceId string)`
2. ✅ Updated all function comments to clarify parameter expectations
3. ✅ Added clear parameter documentation for all service functions

### ✅ Phase 2: Variable Naming Consistency - COMPLETED
1. ✅ Updated all function parameters to use clear naming:
   - `eventSourceId` for external system identifiers
   - `eventPBID` for PocketBase internal IDs
2. ✅ Updated all log messages to use consistent field names
3. ✅ Updated client function parameters to use `eventSourceId`

### ✅ Phase 3: Comments and Documentation - COMPLETED
1. ✅ Updated type comments to clarify URL parameters are source IDs
2. ✅ Updated API route parameter documentation to clarify `{eventId}` is source ID
3. ✅ Added comprehensive function documentation specifying expected ID types

### 🔄 Phase 4: Struct Field Updates - PENDING
1. ⏳ Rename `FullSummary.EventId` to `FullSummary.EventSourceId` (requires API compatibility consideration)
2. ⏳ Consider API route parameter renaming (requires frontend coordination)

## Summary of Changes Made

### Function Parameter Renames
- `setEventAsCurrent(eventId)` → `setEventAsCurrent(eventSourceId)`
- `Snapshot(eventId)` → `Snapshot(eventSourceId)`
- `IngestEventMeta(eventId)` → `IngestEventMeta(eventSourceId)`
- `IngestPilots(eventId)` → `IngestPilots(eventSourceId)`
- `IngestChannels(eventId)` → `IngestChannels(eventSourceId)`
- `IngestRounds(eventId)` → `IngestRounds(eventSourceId)`
- `IngestRace(eventId, raceId)` → `IngestRace(eventSourceId, raceId)`
- `IngestResults(eventId)` → `IngestResults(eventSourceId)`
- `Full(eventId)` → `Full(eventSourceId)`

### Client Function Parameter Renames
- `FetchEvent(eventId)` → `FetchEvent(eventSourceId)`
- `FetchPilots(eventId)` → `FetchPilots(eventSourceId)`
- `FetchRounds(eventId)` → `FetchRounds(eventSourceId)`
- `FetchRace(eventId, raceId)` → `FetchRace(eventSourceId, raceId)`
- `FetchResults(eventId)` → `FetchResults(eventSourceId)`

### Log Message Updates
- All log messages now use `eventSourceId` instead of `eventId` for clarity
- Consistent field naming across all functions

### Comment Updates
- Updated all type comments to clarify URL parameters are source IDs
- Added parameter documentation to all functions
- Clarified expected ID types in function signatures

## Impact Assessment

**Low Risk Changes:**
- Function parameter renames (Go compiler will catch call site updates)
- Log message field name updates
- Comment updates

**Medium Risk Changes:**
- Struct field renames (requires JSON API compatibility consideration)
- API route parameter documentation

**High Risk Changes:**
- None identified - all changes are internal to backend

## Migration Strategy

1. **Start with function renames** - these are safe and compiler-enforced
2. **Update log messages** - improves debugging clarity
3. **Update comments and documentation** - improves developer experience
4. **Consider struct field renames** - evaluate API compatibility impact

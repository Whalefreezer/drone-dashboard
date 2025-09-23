# PocketBase Snapshot Generator

A Deno CLI script for generating realistic PocketBase snapshot files to stress-test the drone dashboard with configurable numbers of pilots, races, and other parameters.

## Overview

This script generates valid `pb-snapshot@v1` JSON files containing:
- Events
- Pilots (with realistic names)
- Channels
- Rounds
- Races
- Pilot-channel assignments
- Optional: Laps and detections for telemetry data

Generated snapshots are compatible with the backend's `-import-snapshot` flag and can be used for stress-testing the dashboard UI with large numbers of pilots.

## Usage

### Basic Usage

```bash
# Generate default 96-pilot snapshot
deno run -A e2e/generate-snapshot.ts

# Generate small test snapshot
deno run -A e2e/generate-snapshot.ts --pilots 12 --races 1

# Generate with telemetry data
deno run -A e2e/generate-snapshot.ts --telemetry
```

### Command Line Options

```
USAGE:
  deno run -A e2e/generate-snapshot.ts [OPTIONS]

OPTIONS:
  -p, --pilots <number>     Number of pilots to generate (default: 96)
  -r, --races <number>      Number of races per round (default: 3)
  -l, --laps <number>       Number of laps per race (default: 4)
  -R, --rounds <number>     Number of rounds (default: 1)
  -s, --seed <string>       Random seed for reproducible generation
  -o, --output <path>       Output file path (default: snapshots/generated-<seed>.json)
  -t, --telemetry           Include lap and detection telemetry data
  -h, --help                Show this help message
```

### Examples

```bash
# Generate 96 pilots (default) with reproducible results
deno run -A e2e/generate-snapshot.ts --seed abc123

# Generate small dataset for testing
deno run -A e2e/generate-snapshot.ts --pilots 24 --races 2 --rounds 1 --seed test

# Generate with full telemetry for performance testing
deno run -A e2e/generate-snapshot.ts --pilots 96 --telemetry --seed perf-test

# Custom output location
deno run -A e2e/generate-snapshot.ts --output my-snapshot.json --pilots 50
```

## Loading Generated Snapshots

### Backend Import

Use the generated snapshot with the backend's `-import-snapshot` flag:

```bash
# Import snapshot and start backend
cd backend
go run main.go -import-snapshot=../snapshots/generated-abc123.json -port=3000

# Or with e2e testing
deno task -c e2e/deno.json preflight
```

The backend will:
1. Import all collections in the correct order
2. Set the generated event as current
3. Merge records by ID (update existing, create missing)
4. Log import statistics

### Frontend Testing

Once imported, the frontend will automatically display the current event with all pilots, races, and leaderboard data. Use this for:

- UI stress testing with 96+ pilots
- Performance testing with large race datasets
- Validating leaderboard and race management features
- Testing pilot/channel assignment logic

## Data Structure

### Generated Collections

- **events**: Single event with realistic name and default race settings
- **pilots**: Configurable number of pilots with faker-generated names
- **channels**: Up to 16 channels (R/F bands) linked to the event
- **rounds**: Configurable number of rounds
- **races**: Races per round with pilot assignments
- **pilotChannels**: Channel assignments for pilots
- **laps** (optional): Lap times for each pilot in each race
- **detections** (optional): RSSI detections for telemetry

### Data Relationships

All generated data maintains proper referential integrity:
- Pilots link to events
- Channels link to events
- Rounds link to events
- Races link to rounds and events
- Pilot-channels link pilots to channels
- Laps link to pilots, races, and channels
- Detections link to laps

### Realistic Data

- **Names**: Uses faker.js for realistic pilot names and event titles
- **IDs**: Deterministic generation from seed for reproducibility
- **Timings**: Realistic lap times and detection intervals
- **Channels**: Standard FPV frequencies with proper band assignments

## Limitations

### Collection Coverage

The generator creates data for core racing collections but excludes:
- Admin collections (`ingest_targets`, `server_settings`)
- Client KV data (empty by default)

### Performance Considerations

- Large pilot counts (>1000) may impact import performance
- Telemetry generation can create thousands of lap/detection records
- Consider memory usage when generating very large datasets

### Deterministic Generation

- Same seed always produces identical output
- Useful for reproducible testing
- Random elements (like pilot assignments to races) are still deterministic

## Development

### Dependencies

- Deno runtime
- @faker-js/faker for realistic data generation
- Standard Deno libraries (flags, fs, crypto)

### Adding New Collections

To add support for additional collections:

1. Update the `collectionsPayload` interface in `backend/importer/snapshot_import.go`
2. Add the collection to the import order in `ImportFromFile`
3. Implement a generator function following the existing pattern
4. Update the `generateSnapshot` function to include the new collection

### Testing

Test imports with:
```bash
# Quick validation
go run backend/main.go -import-snapshot=path/to/snapshot.json -port=3001

# Full e2e test
deno task -c e2e/deno.json preflight
```

## Troubleshooting

### Import Errors

**"sourceId: cannot be blank"**
- Ensure all records have required fields
- Check that channels are linked to events

**"foreign key constraint failed"**
- Verify referential integrity
- Check that parent records exist before child records

### Performance Issues

**Slow imports with large datasets**
- Reduce pilot/channel counts for testing
- Consider disabling telemetry for basic UI testing

**Memory issues**
- Generate smaller snapshots for development
- Use `--pilots 24` for most testing scenarios

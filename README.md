# Drone Dashboard

A real-time drone racing dashboard application built with React, TypeScript, and Jotai for state management. The application provides live tracking of races, pilot performance, and tournament brackets.

## Architecture Overview

### Core Components

1. **Entry Point (`frontend/src/main.tsx`)**
   - Sets up global error handling
   - Renders the main App component with React StrictMode and ErrorBoundary
   - Mounts to DOM element with ID 'root'

2. **State Management (`frontend/src/state.ts`)**
   - Uses Jotai for state management
   - Key atoms:
     - `eventIdAtom`: Fetches current event ID
     - `eventDataAtom`: Manages event data
     - `pilotsAtom`: Manages pilot data
     - `channelsDataAtom`: Manages channel data
     - `roundsDataAtom`: Manages round data
     - `racesAtom`: Manages race data with ordering
     - `raceFamilyAtom`: Individual race data with processed laps

3. **Main Application (`frontend/src/App.tsx`)**
   - Layout Structure:
     ```
     App
     ├── Time Display (fixed header)
     └── Main Content
         ├── Races Container
         │   ├── Last Race
         │   ├── Current Race (with timer)
         │   ├── Brackets View
         │   └── Next Races (up to 8)
         └── Leaderboard Container
             └── Leaderboard Component
     ```

### Features

- Real-time race tracking
- Lap time tracking and display
- Pilot rankings and leaderboards
- Bracket system for tournament management
- Channel management for pilots
- Time tracking and display
- Position change tracking
- Best times and records tracking

### Data Flow

- Current race updates: Every 500ms
- Other races updates: Every 10 seconds
- Rounds data updates: Every 10 seconds
- Implements caching for better performance
- Uses suspense for data loading states

## Development Setup

### Prerequisites

- [Deno](https://deno.land/#installation) v2.1.0 or higher
- [VS Code](https://code.visualstudio.com/) with [Deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) (recommended)

### Environment Configuration

Create a `.env` file in the frontend directory:

```bash
cp frontend/.env.example frontend/.env
```

Key environment variables:
- `VITE_API_URL`: Backend API URL (default: http://localhost:8000)
- `VITE_DEV_MODE`: Enable development features
- `VITE_UPDATE_INTERVAL`: Data update interval in ms
- `VITE_NEXT_RACES_COUNT`: Number of upcoming races to show
- `VITE_API_TIMEOUT`: API request timeout in ms
- `VITE_API_RETRY_COUNT`: Number of API retry attempts
- `VITE_API_RETRY_DELAY`: Delay between retries in ms

### Available Tasks

```bash
# Start development server
deno task dev

# Build for production
deno task build

# Preview production build
deno task preview

# Serve production build
deno task serve

# Run tests
deno task test

# Run tests in watch mode
deno task test:watch
```

### Project Structure

```
.
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── utils/        # Utility functions
│   │   ├── types/        # TypeScript type definitions
│   │   ├── assets/       # Static assets
│   │   ├── App.tsx       # Main application component
│   │   └── main.tsx      # Application entry point
│   ├── tests/            # Test files
│   ├── public/           # Public static files
│   └── dist/            # Production build output
```

### Code Style

The project uses Deno's built-in formatter and linter:

```bash
# Format code
deno fmt

# Lint code
deno lint
```

## Building for Production

1. Build the application:
```bash
deno task build
```

2. Preview the production build:
```bash
deno task preview
```

The production build will be available in the `dist` directory.

## Contributing

1. Create a new branch for your feature
2. Make your changes
3. Run tests and ensure they pass
4. Format and lint your code
5. Submit a pull request

## Testing

The project uses Deno's testing framework with BDD-style tests:

```typescript
import { assertEquals } from "jsr:@std/assert@0.218.2";
import { describe, it } from "jsr:@std/testing@0.218.2/bdd";

describe("utils", () => {
  describe("getPositionWithSuffix", () => {
    it("should return correct suffix for 1st position", () => {
      assertEquals(getPositionWithSuffix(1), "1st");
    });
    // ... more tests
  });
});
```

Run tests with:
```bash
deno task test
# or in watch mode:
deno task test:watch
```

## Known Issues & Planned Features

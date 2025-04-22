# Drone Dashboard

A real-time drone racing dashboard application built with React, TypeScript, and Jotai for state management. The application provides live tracking of races, pilot performance, and tournament brackets.

## Features

- Real-time race tracking
- Lap time tracking and display
- Pilot rankings and leaderboards
- Bracket system for tournament management
- Channel management for pilots
- Time tracking and display
- Position change tracking
- Best times and records tracking

## Quick Start

### Prerequisites

- [Deno](https://deno.land/#installation) v2.1.0 or higher
- [Go](https://golang.org/doc/install) v1.21 or higher
- [VS Code](https://code.visualstudio.com/) with [Deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) (recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd drone-dashboard
   ```

2. Set up environment:
   ```bash
   cp .env.example .env
   ```

3. Install dependencies:
   ```bash
   # Frontend
   cd frontend
   deno task install

   # Backend
   cd ../backend
   go mod download
   ```

4. Start development servers:
   ```bash
   # Frontend (in frontend directory)
   deno task dev

   # Backend (in backend directory)
   go run ./cmd/server
   ```

The application will be available at `http://localhost:5173` by default.

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

### Data Flow

- Current race updates: Every 500ms
- Other races updates: Every 10 seconds
- Rounds data updates: Every 10 seconds
- Implements caching for better performance
- Uses suspense for data loading states

## Development

Please refer to our [Contributing Guide](./CONTRIBUTING.md) for detailed information about:
- Development workflow
- Git branching strategy
- Pull request process
- Testing approach
- CI/CD pipeline
- State management patterns
- Component documentation
- Troubleshooting

### Available Scripts

```bash
# Frontend (in frontend directory)
deno task dev        # Start development server
deno task build      # Build for production
deno task preview    # Preview production build
deno task test       # Run tests
deno task lint       # Run linter
deno task fmt        # Format code

# Backend (in backend directory)
go run ./cmd/server  # Start backend server
go test ./...        # Run tests
```

### Environment Configuration

Key environment variables (in `.env`):
- `VITE_API_URL`: Backend API URL (default: http://localhost:8000)
- `VITE_DEV_MODE`: Enable development features
- `VITE_UPDATE_INTERVAL`: Data update interval in ms
- `VITE_NEXT_RACES_COUNT`: Number of upcoming races to show
- `VITE_API_TIMEOUT`: API request timeout in ms
- `VITE_API_RETRY_COUNT`: Number of API retry attempts
- `VITE_API_RETRY_DELAY`: Delay between retries in ms

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
├── backend/
│   ├── cmd/
│   │   └── server/      # Server entry point
│   ├── internal/        # Internal packages
│   └── tests/          # Backend tests
├── .github/            # GitHub configuration
├── docs/              # Documentation
└── scripts/           # Build and utility scripts
```

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
  });
});
```

## Additional Resources

- [Coding Standards](./CODING_STANDARDS.md)
- [Improvement Plan](./IMPROVEMENT_PLAN.md)
- [API Documentation](./backend/README.md)
- [Frontend Architecture](./frontend/README.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:
1. Check the [Troubleshooting](./CONTRIBUTING.md#troubleshooting) section
2. Search existing issues
3. Create a new issue with detailed information
4. Tag maintainers for urgent matters

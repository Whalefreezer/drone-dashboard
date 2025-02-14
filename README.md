# Drone Dashboard

A real-time dashboard for tracking drone racing metrics and statistics, built with React, Vite, and Deno.

> **Note**: This project is primarily AI-generated and is currently in an experimental state. While functional, there may be some rough edges and non-optimal implementations that haven't been refined yet. Contributions and improvements are welcome!

## Prerequisites

- Deno v2.0.0 or later
- Node.js and npm (for node_modules dependencies)
- Backend server running on port 8080

## Tech Stack

- **Frontend**: React 18
- **State Management**: Jotai + TanStack Query
- **Build Tool**: Vite
- **Runtime**: Deno
- **Additional Libraries**:
  - QR Code generation (qrcode.react)
  - Axios for HTTP requests

## Development

Start the development server:

```bash
deno task dev
```

The development server will run on port 3000 by default.

### Proxy Server

The application includes a proxy server (proxy.ts) that forwards requests to the backend:

```bash
deno run --allow-net proxy.ts
```

The proxy server runs on port 8000 and forwards requests to `http://localhost:8080`.

## Deployment

Build production assets:

```bash
deno task build
```

To serve the built assets:

```bash
deno task serve
```

## Project Structure

```
├── src/
│   ├── App.tsx         # Main application component
│   ├── state.ts        # Global state management
│   ├── types.ts        # TypeScript type definitions
│   ├── utils.ts        # Utility functions
│   └── assets/         # Static assets
├── proxy.ts            # Development proxy server
└── deno.json          # Deno configuration and dependencies
```

## Known Issues & Planned Features

### Race Management
- New rounds are not added automatically
- Race countdown sync clocks need fixing
- Early race termination handling needs implementation
- Race position indicators (1st, 2nd, etc.) need to be added

### Timing & Statistics
- Fastest lap tracking
- Fastest 2 consecutive laps tracking
- Individual race and overall statistics
- Delta timing when channel changes

### UI Improvements
- Lap table headers need proper labeling (HS, L1, L2, etc.)
- Real-time data synchronization improvements
- Mobile responsiveness enhancements

### Technical Debt
- Improve error handling in proxy server
- Add proper TypeScript types for API responses
- Implement proper WebSocket connection handling
- Add loading states for data fetching


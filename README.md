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
└── deno.json          # Deno configuration and dependencies
```

## Known Issues & Planned Features

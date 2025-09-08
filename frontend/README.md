# FPVTrackside Dashboard Frontend

A real-time dashboard for FPVTrackside race management system, built with Deno, TypeScript, and React.

## Prerequisites

- [Deno](https://deno.land/#installation) v2.1.0 or higher
- [VS Code](https://code.visualstudio.com/) with [Deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)
  (recommended)

## Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd drone-dashboard/frontend
   ```

2. Install VS Code Deno extension:
   - Open VS Code
   - Install the Deno extension
   - Reload VS Code
   - The workspace settings will automatically configure the extension

3. Environment Configuration:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` file with your configuration values.

## Development

Start the development server:

```bash
deno task dev
```

The application will be available at `http://localhost:5173`

### Available Tasks

- `deno task dev` - Start development server
- `deno task build` - Build for production
- `deno task preview` - Preview production build
- `deno task serve` - Serve production build
- `deno task test` - Run tests
- `deno task test:watch` - Run tests in watch mode

### Router Devtools

If you see Solid-related warnings in the browser console (e.g., "You appear to have multiple instances of Solid" or "computations created
outside a createRoot"), they originate from `@tanstack/react-router-devtools` pulling a Solid runtime for its overlay UI. You can disable
the overlay by setting:

```
VITE_ROUTER_DEVTOOLS=false
```

in your `.env` (or leave it unset). To enable explicitly during local debugging, set it to `true`.

## Project Structure

```
frontend/
├── src/
│   ├── components/    # React components
│   ├── hooks/        # Custom React hooks
│   ├── utils/        # Utility functions
│   ├── types/        # TypeScript type definitions
│   ├── assets/       # Static assets
│   ├── App.tsx       # Main application component
│   └── main.tsx      # Application entry point
├── tests/            # Test files
├── public/           # Public static files
└── dist/            # Production build output
```

## Code Style

The project uses Deno's built-in formatter and linter. Format your code with:

```bash
deno fmt
```

Lint your code with:

```bash
deno lint
```

## Testing

Run the test suite:

```bash
deno task test
```

Watch mode for development:

```bash
deno task test:watch
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

## Environment Variables

| Variable              | Description                      | Default               |
| --------------------- | -------------------------------- | --------------------- |
| VITE_API_URL          | Backend API URL                  | http://localhost:8000 |
| VITE_DEV_MODE         | Enable development features      | true                  |
| VITE_UPDATE_INTERVAL  | Data update interval (ms)        | 500                   |
| VITE_NEXT_RACES_COUNT | Number of upcoming races to show | 8                     |
| VITE_API_TIMEOUT      | API request timeout (ms)         | 10000                 |
| VITE_API_RETRY_COUNT  | Number of API retry attempts     | 10                    |
| VITE_API_RETRY_DELAY  | Delay between retries (ms)       | 100                   |

### PocketBase Authentication

To require login for `/admin`, configure PocketBase URL:

- `VITE_API_URL` — PocketBase base URL (e.g., `http://127.0.0.1:8090`).

Then visit `/login` to sign in either as:

- Admin (`_superusers`) using email/password.
- User (`users` collection) using identity/password.

Logout simply clears the client token (`pb.authStore.clear()`); PocketBase is stateless and has no logout endpoint.

## Contributing

1. Create a new branch for your feature
2. Make your changes
3. Run tests and ensure they pass
4. Format and lint your code
5. Submit a pull request

## License

[Add your license information here]

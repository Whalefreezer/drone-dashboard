# Contributing to Drone Dashboard

This document outlines the development workflow and guidelines for contributing to the Drone Dashboard project.

## Development Environment Setup

1. **Prerequisites**
   - Deno (latest version)
   - Go (for backend development)
   - VS Code with Deno extension (recommended)
   - Git

2. **Initial Setup**
   ```bash
   # Clone the repository
   git clone <repository-url>
   cd drone-dashboard

   # Copy environment file and configure
   cp .env.example .env

   # Install dependencies (frontend)
   cd frontend
   deno task install

   # Install dependencies (backend)
   cd ../backend
   go mod download
   ```

## Git Workflow

We follow a trunk-based development workflow with short-lived feature branches:

1. **Branch Naming Convention**
   ```
   <type>/<short-description>
   ```
   Types:
   - `feat/` - New features
   - `fix/` - Bug fixes
   - `refactor/` - Code refactoring
   - `docs/` - Documentation updates
   - `test/` - Test additions or modifications
   - `chore/` - Maintenance tasks

   Example: `feat/race-status-display`

2. **Development Flow**
   ```bash
   # Create a new branch from main
   git checkout main
   git pull
   git checkout -b feat/your-feature

   # Make your changes, commit frequently
   git add .
   git commit -m "feat: add race status display component"

   # Keep your branch up to date
   git fetch origin
   git rebase origin/main

   # Push your branch
   git push origin feat/your-feature
   ```

3. **Commit Message Format**
   ```
   <type>(<scope>): <description>

   [optional body]

   [optional footer]
   ```
   Example:
   ```
   feat(race-status): add real-time lap counter

   - Implements WebSocket connection for live updates
   - Adds lap counter component with animation
   - Updates state management for race data

   Closes #123
   ```

## Pull Request Process

1. **Before Creating a PR**
   - Ensure all tests pass: `deno test`
   - Run linter: `deno lint`
   - Format code: `deno fmt`
   - Update documentation if needed
   - Rebase on main if needed

2. **PR Creation**
   - Use the PR template
   - Link related issues
   - Add meaningful description
   - Request reviews from team members
   - Add labels as appropriate

3. **PR Review Guidelines**
   - Code follows [Coding Standards](./CODING_STANDARDS.md)
   - Tests cover new functionality
   - Documentation is updated
   - No unnecessary code changes
   - Performance considerations addressed

4. **Merging**
   - Squash and merge to keep history clean
   - Delete branch after merging

## Testing Approach

1. **Unit Tests**
   - Required for all new features
   - Located in `tests/` directory
   - Run with `deno test`
   - Coverage target: 80%

2. **Integration Tests**
   - Test component interactions
   - API endpoint testing
   - WebSocket communication testing

3. **End-to-End Tests**
   - Critical user flows
   - Run with Playwright
   - Located in `tests/e2e/`

4. **Test Guidelines**
   - Use descriptive test names
   - Follow AAA pattern (Arrange, Act, Assert)
   - Mock external dependencies
   - Test edge cases and error scenarios

## CI/CD Pipeline

1. **Continuous Integration**
   - Triggered on PR creation/update
   - Runs all tests
   - Linting and formatting checks
   - Type checking
   - Build verification

2. **Continuous Deployment**
   - Automated deployment to staging on main branch updates
   - Manual approval required for production deployment
   - Automated rollback capability

3. **Environment Configuration**
   - Development: Local environment
   - Staging: Mirrors production
   - Production: Live environment

## State Management with Jotai

1. **Store Organization**
   ```typescript
   // Domain-specific atoms
   const raceAtom = atom({ /* ... */ });
   const pilotsAtom = atom({ /* ... */ });
   const channelsAtom = atom({ /* ... */ });
   ```

2. **Data Flow**
   - Atoms for primitive state
   - Derived atoms for computed state
   - Async atoms for API calls
   - Provider wrapping for scoped state

3. **Best Practices**
   - Colocate related atoms
   - Use selectors for specific data needs
   - Implement proper error handling
   - Consider performance implications

## Component Documentation

1. **Component Structure**
   ```typescript
   /**
   * @component RaceStatus
   * @description Displays current race status and real-time updates
   *
   * @example
   * <RaceStatus
   *   raceId={123}
   *   showDetails={true}
   * />
   */
   ```

2. **Props Documentation**
   ```typescript
   interface RaceStatusProps {
     /** Unique identifier for the race */
     raceId: number;
     /** Whether to show detailed race information */
     showDetails?: boolean;
   }
   ```

## Development Scripts

```bash
# Frontend
deno task dev        # Start development server
deno task build      # Build for production
deno task preview    # Preview production build
deno task test       # Run tests
deno task lint       # Run linter
deno task fmt        # Format code

# Backend
go run ./cmd/server  # Start backend server
go test ./...        # Run backend tests
```

## Troubleshooting

1. **Common Issues**
   - Port conflicts
   - WebSocket connection issues
   - State management bugs
   - Build failures

2. **Debugging Tools**
   - Chrome DevTools
   - VS Code debugger
   - Logging utilities
   - Performance profiler

## Additional Resources

- [Coding Standards](./CODING_STANDARDS.md)
- [Improvement Plan](./IMPROVEMENT_PLAN.md)
- [API Documentation](./backend/README.md)
- [Frontend Architecture](./frontend/README.md)

## Questions and Support

- Create an issue for bugs or feature requests
- Use discussions for questions
- Tag maintainers for urgent issues

Remember to always prioritize code quality, maintainability, and user experience in your contributions. 
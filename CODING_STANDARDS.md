# Coding Standards

This document outlines the coding standards and best practices for the Drone Dashboard project.

## File Organization

### Directory Structure
```
frontend/
├── src/
│   ├── components/     # React components
│   │   ├── races/     # Race-related components
│   │   ├── pilots/    # Pilot-related components
│   │   ├── common/    # Shared/reusable components
│   │   └── layout/    # Layout components
│   ├── hooks/         # Custom React hooks
│   ├── utils/         # Utility functions
│   ├── types/         # TypeScript type definitions
│   ├── services/      # API and external service integrations
│   ├── state/         # State management (Jotai)
│   └── assets/        # Static assets
└── tests/             # Test files
```

### File Naming Conventions
- React Components: PascalCase (e.g., `RaceTimer.tsx`)
- Hooks: camelCase with 'use' prefix (e.g., `useRaceData.ts`)
- Utilities: camelCase (e.g., `timeUtils.ts`)
- Types/Interfaces: PascalCase (e.g., `RaceData.ts`)
- Test Files: Same name as the file being tested with `.test.ts` suffix

## React Components

### Component Structure
```typescript
// Imports ordered by: React, External Libraries, Internal Modules
import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { RaceData } from '@/types';
import { useRaceData } from '@/hooks';
import { formatTime } from '@/utils';

// Interface for props
interface RaceTimerProps {
  raceId: string;
  showMilliseconds?: boolean;
}

// Component with explicit return type
export const RaceTimer: React.FC<RaceTimerProps> = ({
  raceId,
  showMilliseconds = false,
}) => {
  // Implementation
  return (
    <div>
      {/* JSX */}
    </div>
  );
};
```

### Component Guidelines
1. Use functional components with hooks
2. Keep components focused and single-responsibility
3. Extract reusable logic into custom hooks
4. Use TypeScript interfaces for props
5. Provide default values for optional props
6. Use proper semantic HTML elements
7. Keep JSX clean and readable

## TypeScript Usage

### Type Definitions
```typescript
// Use interfaces for objects that can be implemented
interface Pilot {
  id: string;
  name: string;
  channel: number;
}

// Use type for unions, intersections, or mapped types
type RaceStatus = 'pending' | 'active' | 'completed';

// Use enums for fixed sets of values
enum Channel {
  R1 = 1,
  R2 = 2,
  // ...
}
```

### Type Guidelines
1. Avoid `any` type - use proper typing or `unknown`
2. Use strict null checks
3. Prefer interfaces for object types
4. Use type guards for runtime type checking
5. Document complex types with JSDoc comments
6. Use generics when appropriate

## State Management (Jotai)

### Atom Organization
```typescript
// Group related atoms in domain-specific files
// state/raceState.ts
import { atom } from 'jotai';
import { Race } from '@/types';

export const currentRaceAtom = atom<Race | null>(null);
export const raceHistoryAtom = atom<Race[]>([]);
```

### State Guidelines
1. Organize atoms by domain/feature
2. Use derived atoms for computed values
3. Keep atom updates atomic and focused
4. Use suspense for async operations
5. Implement proper error handling
6. Cache results when appropriate

## Error Handling

### Error Patterns
```typescript
// Custom error types
class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Error handling in async functions
async function fetchRaceData(raceId: string): Promise<RaceData> {
  try {
    const response = await fetch(`/api/races/${raceId}`);
    if (!response.ok) {
      throw new APIError('Failed to fetch race data', response.status);
    }
    return await response.json();
  } catch (error) {
    // Log error for monitoring
    console.error('Race data fetch error:', error);
    // Rethrow for error boundary to catch
    throw error;
  }
}
```

### Error Guidelines
1. Use custom error types for different error categories
2. Implement error boundaries for UI error handling
3. Log errors appropriately
4. Provide user-friendly error messages
5. Handle edge cases and loading states

## Performance Optimization

### Optimization Patterns
```typescript
// Memoize expensive computations
const memoizedValue = useMemo(() => {
  return expensiveCalculation(prop);
}, [prop]);

// Memoize callbacks
const handleClick = useCallback(() => {
  // Handle click
}, [/* dependencies */]);

// Optimize re-renders
const MemoizedComponent = memo(MyComponent);
```

### Performance Guidelines
1. Use React.memo for pure components
2. Implement useMemo for expensive computations
3. Use useCallback for function props
4. Optimize list rendering with proper keys
5. Implement proper loading states
6. Use code splitting for large components

## Testing

### Test Structure
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RaceTimer } from './RaceTimer';

describe('RaceTimer', () => {
  it('displays correct time format', () => {
    render(<RaceTimer raceId="123" />);
    expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
  });
});
```

### Testing Guidelines
1. Write unit tests for utility functions
2. Write integration tests for complex components
3. Use meaningful test descriptions
4. Test edge cases and error scenarios
5. Mock external dependencies
6. Maintain good test coverage

## CSS and Styling

### CSS Organization
```typescript
// Use CSS modules for component-specific styles
import styles from './RaceTimer.module.css';

// Use semantic class names
export const RaceTimer = () => (
  <div className={styles.container}>
    <span className={styles.time}>00:00:00</span>
  </div>
);
```

### Styling Guidelines
1. Use CSS modules for component-specific styles
2. Follow BEM naming convention for global styles
3. Use CSS variables for theming
4. Implement responsive design
5. Maintain consistent spacing and typography
6. Ensure accessibility compliance

## Documentation

### Code Documentation
```typescript
/**
 * Formats a time duration in seconds to a human-readable string.
 * @param seconds - The duration in seconds
 * @param showMilliseconds - Whether to include milliseconds in the output
 * @returns Formatted time string (e.g., "01:23:45" or "01:23:45.678")
 * @throws {TypeError} If seconds is not a number
 */
export function formatTime(
  seconds: number,
  showMilliseconds = false
): string {
  // Implementation
}
```

### Documentation Guidelines
1. Use JSDoc for function and component documentation
2. Document complex algorithms and business logic
3. Keep documentation up to date
4. Include examples in documentation
5. Document known limitations and edge cases

## Git Workflow

### Commit Messages
```
feat(race): add real-time lap counter

- Implement lap counting logic
- Add visual indicator for current lap
- Update tests for lap counting feature

Closes #123
```

### Git Guidelines
1. Use semantic commit messages
2. Keep commits focused and atomic
3. Write descriptive commit messages
4. Reference issues in commits
5. Follow branch naming conventions

## Code Review

### Review Guidelines
1. Check for adherence to these standards
2. Verify proper error handling
3. Review performance implications
4. Ensure adequate test coverage
5. Validate documentation updates
6. Check for security considerations

## Security

### Security Guidelines
1. Validate all user inputs
2. Implement proper authentication checks
3. Use secure communication protocols
4. Handle sensitive data appropriately
5. Follow security best practices
6. Regular security audits

## Accessibility

### Accessibility Guidelines
1. Use semantic HTML elements
2. Implement proper ARIA attributes
3. Ensure keyboard navigation
4. Maintain color contrast ratios
5. Provide text alternatives for images
6. Test with screen readers 
Responsive breakpoints (provider + hook)

API

- `ResponsiveProvider`: Wraps the app once (see `src/main.tsx`). Observes viewport size via `matchMedia` with a `ResizeObserver`/`resize`
  fallback and debounced updates (~120ms).
- `useBreakpoint()`: Returns `{ breakpoint, isMobile, isTablet, isDesktop, width, height }`.
- Atoms: `viewportAtom` and `breakpointAtom` for direct reads/selectors (Jotai).

Breakpoints (min-width thresholds)

- mobile: `width < 600`
- tablet: `600 <= width < 960`
- desktop: `width >= 960`

Notes

- No persistence. Pure observation.
- Config lives in `responsive/breakpoints.ts` as min-width thresholds (`tabletMin`, `desktopMin`).

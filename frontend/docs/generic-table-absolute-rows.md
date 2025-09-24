# GenericTable: Dynamic Absolute Rows

`GenericTable` renders a table-like grid using absolutely positioned rows so we can animate reorders smoothly with `@react-spring/web`. Rows
can now grow and shrink to fit their content, removing the need to pad every row to the tallest cell.

## Key Concepts

- Absolute positioning keeps reorder animations smooth. Each row is wrapped in an absolutely positioned container whose `translateY` and
  `height` are driven by a spring.
- A `ResizeObserver` measures the intrinsic height of every rendered row. We cache the measured height per row key so reorders maintain the
  correct offsets.
- `estimatedRowHeight` replaces the old `rowHeight` prop. It acts as the initial guess while we wait for measurements and as the fallback
  height if measurement is unavailable.
- `rowMode="fixed"` keeps the legacy constant-height behaviour for admin tables and other simple lists. The default mode is `dynamic` which
  enables measurement-based heights.

## Rendering Flow

1. Build `items = data.map(row => ({ row, key }))` so row keys are stable for transitions.
2. For each key we maintain a cached height. In dynamic mode a `ResizeObserver` updates the cache whenever the DOM height changes. Entries
   are removed when a key disappears.
3. We compute cumulative offsets from the cached heights, falling back to the estimate. The body container height is the total of those
   values.
4. `useTransition` animates both `y` and `height`. Rows translate to their cumulative offset while their wrappers interpolate to the new
   measured height, preventing jump cuts when content grows or shrinks.
5. The inner `.gt-row` keeps the grid layout and styling. The animated wrapper only handles positioning and height so measurement can
   observe the natural content size.

## Props Overview

| Prop                             | Description                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `estimatedRowHeight?: number`    | Default 40. Initial guess for dynamic mode and explicit height for fixed mode.       |
| `rowMode?: 'dynamic' \| 'fixed'` | Defaults to `'dynamic'`. Set `'fixed'` to skip measurement and keep uniform heights. |
| `visibleColumns?: string[]`      | Filter columns without remounting the table.                                         |
| `scrollX?: boolean`              | Opt-in horizontal scroll wrapper.                                                    |

## CSS Notes

- `.gt-row` now reflects the measured height. Keep vertical padding minimal so one-line rows stay compact. Multi-line cells naturally push
  the row taller.
- Sticky cells (`position`/`pilot`) continue to rely on hard-coded widths. Update the matching left offsets in `Leaderboard.css` if those
  widths change.
- Give fade-out gradients (`.fade-overflow::after`) a transparent stop so the extra vertical space introduced by taller rows remains
  consistent.

## Fixed-Height Consumers

Admin tables still prefer rows with constant height. Pass `rowMode='fixed'` together with an `estimatedRowHeight` (e.g., 30/36/40) to retain
the old behaviour. The code path skips the `ResizeObserver` and computes offsets as `index * estimatedRowHeight` like before.

## Testing Checklist

- Toggle columns and resize the window to confirm sticky headers and columns remain aligned.
- Verify rows with diff lines (e.g., `RenderTimeCell`) expand while simple rows stay compact.
- Confirm admin tables render exactly as before with the new `rowMode='fixed'` flag.

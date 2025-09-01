# GenericTable: Absolute-Positioned Rows (Prep for @react-spring/web)

This document outlines how to evolve `GenericTable` from a semantic `<table>` to a div-based layout where each row is absolutely positioned. The goal is to enable smooth, independent row animations (e.g., on leaderboard reordering) using `@react-spring/web`.

## Current State

- Component: `frontend/src/common/tableColumns.tsx`
  - Renders a `<table>` with `<colgroup>`, `<thead>`, `<tbody>`.
  - `Column<TableCtx, RowCtx>`: `{ key, header, cell, headerClassName?, headerAlign?, width?, minWidth? }`.
  - `GenericTable` maps rows to `<tr>` and cells to `<td>` by calling `React.createElement(Cell, row)`.
- Usage:
  - Leaderboard: `frontend/src/leaderboard/Leaderboard.tsx` + columns in `leaderboard-columns.tsx`.
  - Laps view: `frontend/src/race/LapsView.tsx`.
- Many column cell renderers return `<td>` directly (e.g., `NextRaceCell`, `RenderTimeCell`, `OverflowFadeCell` and several inline cells). Some cells assume `HTMLTableCellElement` and table-specific CSS.
- CSS relies on table structure for layout, striping, hover, and overflow fades (`Leaderboard.css`, `LapsView.css`).

## Goals

- Replace table rows with absolutely-positioned div rows to allow animating Y-position changes.
- Keep the existing `columns` API (keys, headers, widths) with minimal change.
- Hardcode a fixed `rowHeight` for consistent positioning and animation math.
- Preserve column widths: all but one column are fixed-width; one flex column can fill remaining space.
- Prepare clear extension points to wire `@react-spring/web` useSprings for animated `transform: translateY(...)`.

## Proposed Design

- New layout: div-based “table” with a sticky header row and an absolutely-positioned row layer.
  - Container: `position: relative`.
  - Header: a normal flow div row using the same column template.
  - Body: a `position: relative` wrapper with fixed `height = rowCount * rowHeight`; each row is `position: absolute; top: 0; transform: translateY(y)`.
- Columns layout: CSS Grid per row for stable columns.
  - Build `grid-template-columns` from `columns`: fixed widths for known columns plus a single `1fr` for the flex column (Pilot/Name).
  - Continue honoring `width` and `minWidth` props from `Column`.
- Row height: constant used in both CSS and JS.
  - Example: `const ROW_HEIGHT = 36` (TBD via design/visual check).
- Animation: leave hooks to pass `style` to each row (later replaced by springs).
  - For now compute `y = index * ROW_HEIGHT` and set style `{ transform: \`
  `translateY(${y}px)` }`.

## API Changes (Breaking)

- Replace `GenericTable` implementation with a div-based, absolutely-positioned row layout. No legacy/table-based component is kept.
- All column cell components must return content (divs/spans/fragments), not `<td>` elements.
- Update `OverflowFadeCell` and any table-specific cells to render as generic block elements and to use a generic `HTMLElement` ref.
- Row height is hardcoded inside `GenericTable` (no prop). Expose a CSS variable `--gt-row-height` for styling overrides if needed.
- Header remains sticky by default; no prop to toggle for now.

### Cell Renderers

- Refactor existing cells that return `<td>` to return their inner content (or a `<div>` wrapper) without table semantics.
- `OverflowFadeCell` should become polymorphic or strictly `<div>`-based; measured via `HTMLDivElement`.

## DOM Structure (Div-based)

- Header:
  - `<div class="gt gt-header" role="row">`
    - Children: one div per column (`role="columnheader"`), respecting `headerAlign`.
- Body:
  - `<div class="gt gt-body" style={{ height: rows*ROW_HEIGHT }}>`
    - For each row: `<div class="gt-row" role="row" style={{ transform: translateY(...) }}>`
      - Children: one div per column (`role="gridcell"`).

ARIA: optional. No keyboard navigation is required. We may add `role="grid"`, `row`, `columnheader`, and `gridcell` for basic semantics, but focus management and keyboard support are out of scope.

## Styling Plan

- New CSS module(s) or updates to existing styles:
  - `.gt`: base container, `display: grid` only for header/body alignment scaffolding if needed.
  - `.gt-header`: sticky header style, grid for columns.
  - `.gt-body`: `position: relative; overflow: hidden/auto` (decide on scroll behavior). Height set by content or parent.
  - `.gt-row`: `position: absolute; left: 0; right: 0; height: var(--gt-row-height); display: grid; grid-template-columns: <computed>`.
  - Striping/hover: add `row-odd/row-even` classes based on index; nth-child does not apply to absolutely-positioned elements.
  - Overflow fade: provide row background CSS variable (per-row) so fade gradients match striping (similar to current `--table-bg-*`).

## Widths and Grid Template

- Use `columns.map` to build a template string:
  - Fixed width columns: `px` values (e.g., `64px`).
  - `minWidth` honored via `minmax(minWidth, minWidth)` for fixed columns, or `minmax(minWidth, 1fr)` for the single flex column.
- Determine the single flex column heuristically:
  - If multiple columns lack `width`, pick the one with largest `minWidth` or first without `width`.
  - In current code: Leaderboard “Pilot” and Laps “Name” act as flex columns.

## Integration Points for @react-spring/web

- Replace per-row style with springs:
  - `const [springs] = useSprings(rows.length, i => ({ y: i*ROW_HEIGHT, key: rowKey(i) }))`.
  - Render `<animated.div className="gt-row" style={{ transform: springs[i].y.to(t => `translateY(${t}px)`) }}>`.
  - Keys come from `getRowKey(row, i)` to stabilize animations across reorderings.

## Migration Plan (Breaking, Single Pass)

1. Rewrite `GenericTable` to div-based absolute rows with a fixed internal row height.
   - Implement grid-based header and absolute-positioned body rows.
   - Compute `grid-template-columns` from `columns` (`width` for fixed, one flex column fills remaining space).
2. Refactor all cells to content-only rendering across the app (no `<td>` anywhere).
   - Update `OverflowFadeCell` to div-based overflow detection and fade, and move it to `frontend/src/common/OverflowFadeCell.tsx`.
   - Replace any `<td>` returns in `leaderboard-columns.tsx` and `race/LapsView.tsx` with content elements.
   - Update imports in Leaderboard and LapsView to use the common `OverflowFadeCell`.
3. Replace table CSS with `.gt` classes for both Leaderboard and LapsView.
   - Remove `.leaderboard-table` and `.laps-table` rules; migrate striping/hover/overflow styles to `.gt` equivalents.
   - Add striping via `row-odd/row-even`; nth-child is no longer applicable.
   - Ensure overflow fade backgrounds match theme variables via per-row CSS var.
4. Adapt LapsView specifics to grid cells.
   - Keep lap highlighting classes (`.lap-fastest-overall`, etc.) but apply them to cell divs.
   - Ensure dynamic lap columns (HS + L1..N) render as fixed-width grid cells.
5. Validate and refine widths/overflow for both screens.
   - Confirm the single flex column (Pilot/Name) expands correctly.
   - Align fade gradients and spacing with current visuals.
6. Add integration hooks for animation.
   - Rows render with static `translateY(index * ROW_HEIGHT)`; swap to springs later.

## Files to Touch

- Update: `frontend/src/common/tableColumns.tsx` — replace `<table>` implementation with div-based absolute rows.
- Add/Move: `frontend/src/common/OverflowFadeCell.tsx` — div-based overflow detector; update all imports.
- Update: `frontend/src/leaderboard/leaderboard-columns.tsx` — remove hard `<td>` returns; return content.
- Update: `frontend/src/leaderboard/Leaderboard.tsx` — continues importing `GenericTable` (div-based).
- Update: `frontend/src/leaderboard/Leaderboard.css` — add `.gt` classes and remove `.leaderboard-table` rules.
- Update: `frontend/src/race/LapsView.tsx` — convert all cells to content-only and import common `OverflowFadeCell`.
- Update: `frontend/src/race/LapsView.css` — replace `.laps-table` with `.gt` rules; port lap highlighting classes.

## Open Questions / Decisions Needed

- Exact `rowHeight` value? Suggest 36–40px; confirm against current visual density.
- Should header be sticky inside scrollable body or fixed above? For now, sticky within container.
- Do we need keyboard navigation and full table semantics? If yes, add `role="grid"`/`aria-rowcount` and manage focus.
- Scrolling: container scroll vs. window scroll. If container scrolls, ensure header remains visible.
- Virtualization: do we need it for large lists? Absolute rows enable simple virtualization later.

## Risks and Mitigations

- Wide-reaching breaking change touches Leaderboard and Laps screens. Mitigation: single-branch refactor with focused PR and visual verification.
- Cells rely on `<td>` semantics and CSS. Mitigation: update all cells to div/content-only and centralize common styles under `.gt`.
- Overflow detection currently uses `HTMLTableCellElement`. Mitigation: switch to `HTMLDivElement` and test resize behavior.
- CSS striping uses `nth-child`. Mitigation: add `row-odd/row-even` classes in renderer.
- LapsView has variable column counts (HS/L1..N). Mitigation: compute grid template from `columns` each render and keep fixed widths for lap cells.

## Acceptance Criteria

- `GenericTable` is div-based with absolute rows and fixed internal row height.
- Leaderboard and Laps views render via the new `GenericTable` with no `<table>` elements or `.leaderboard-table`/`.laps-table` CSS remaining.
- Visual parity for widths, striping, hover, and overflow fades on both screens.
- Reordering the underlying `data` updates row positions via `transform: translateY` without layout thrash.
- Columns API remains the same; all cells have been refactored to remove `<td>` usage.

## Example Skeleton (Pseudo-code)

```tsx
export function GenericTableDiv<TableCtx, RowCtx extends object>({
  columns, data, context, getRowKey, getRowClassName, className,
  rowHeight,
}: GenericTableProps<TableCtx, RowCtx> & { rowHeight: number }) {
  const template = useMemo(() => buildGridTemplate(columns), [columns]);
  const totalH = data.length * rowHeight;

  return (
    <div className={clsx('gt', className)} role="grid">
      <div className="gt-header" style={{ gridTemplateColumns: template }} role="row">
        {columns.map(col => (
          <div key={col.key} role="columnheader" style={{ textAlign: col.headerAlign }} className={col.headerClassName}>
            {typeof col.header === 'function' ? col.header(context) : col.header}
          </div>
        ))}
      </div>
      <div className="gt-body" style={{ height: totalH }}>
        {data.map((row, i) => {
          const key = getRowKey(row, i);
          const y = i * rowHeight;
          return (
            <div key={key} className={clsx('gt-row', getRowClassName?.(row, i), i % 2 ? 'row-even' : 'row-odd')}
                 role="row" style={{ transform: `translateY(${y}px)`, gridTemplateColumns: template, height: rowHeight }}>
              {columns.map(col => {
                const Cell = col.cell as React.ComponentType<RowCtx>;
                return (
                  <div key={col.key} role="gridcell" className="gt-cell">
                    {React.createElement(Cell, row)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Note: Cells should return content, not `<td>`. For existing cells that emit `<td>`, either:
- wrap their children in a `CellBox` that renders as `td` or `div`, or
- refactor cells to return content-only and let the table variant wrap them.

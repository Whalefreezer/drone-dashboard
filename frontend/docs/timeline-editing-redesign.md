# Timeline Editing Redesign

## Goals

- Put the live timeline canvas front and center so editors manipulate events directly instead of via a detached table.
- Support fluid zooming and panning so long schedules remain usable, regardless of screen height/width.
- Keep all edits local until the user explicitly presses Save or Reset, enabling review before publishing.
- Make temporal adjustments intuitive by letting editors drag boundaries while preserving event durations.
- Reinforce the vertical time axis so earlier events sit higher on the canvas and later events flow downward.

## Canvas & Navigation

- The timeline stage should occupy the primary real estate, scaling to the viewport while maintaining readable event cards in a vertical flow.
- Vertical pan uses click-drag or trackpad swipe with inertia; horizontal pan is limited to small overflow nudges if content exceeds the inspector split.
- Zoom revolves around the pointer or focused event, scaling the vertical axis while keeping horizontal spacing stable. Support scroll, pinch, and +/- controls with velocity-based smoothing to avoid jump cuts.
- Zoom levels snap to sensible presets (e.g., 5, 10, 15, 30, 60 minute vertical spacing) so tick marks and labels stay legible.
- A mini-map or overview stripe can re-center quickly when users get lost after aggressive zooming and should depict the current viewport window along the vertical stack.

## Item Selection & Inspector

- Clicking an item focuses it, highlights its bounds on the canvas, and opens an editor panel.
- The inspector can dock to the right or bottom; it should persist while the item is selected and disappear on deselect.
- Editable fields mirror the existing schema (title/description, category, sort key, start/end times, metadata). Non-primary fields collapse behind accordions to keep the panel compact.
- Start and end times display both absolute timestamps and offsets from day start, with quick nudge controls (±5m, ±15m) that operate on the pending working copy.
- Validation feedback appears inline and marks the card on the canvas so errors remain discoverable when the inspector is hidden.
- Space for the inspector should always be reserved to minimise layout flicker when toggling selections.

## Boundary Highlight & Dragging

- Hovering within a configurable threshold (e.g., 12px) of an event boundary highlights the shared horizontal edge across adjacent items.
- On pointer down, show a time tooltip and a guideline spanning the full timeline width to emphasize the slice being adjusted.
- Movement snaps to five-minute increments; keyboard nudge (↑/↓) matches the same step for accessibility.
- Dragging the boundary downward (later in time) extends the event above the boundary. The event below, and every event after it, shift their start times later by the same delta while keeping their durations unchanged.
- Dragging the boundary upward (earlier in time) shortens the event above the boundary. The event below, and every event after it, shift their start times earlier by the same delta while keeping their durations unchanged. This closes gaps rather than leaving empty space.
- Events may not shrink below five minutes. Once the upstream event reaches that minimum, additional upward drag must be absorbed by gaps or break blocks instead of further shortening the event.
- The schedule can extend earlier or later than its original bounds; there is no artificial clamp at the start or end of the day.

## Gap & Break Handling

- When a shift encounters an unscheduled gap, consume that gap before moving subsequent events. Only once the gap is eliminated do later items begin to bump.
- Break-category items act as elastic buffers. They can shrink or grow to absorb time deltas but may never drop below five minutes. If a requested shrink would violate that minimum, maintain the five-minute floor and continue propagating the remaining delta to later events.
- Propagation continues down the tail until the adjustment is fully absorbed, ensuring the timeline stays contiguous without overlaps or negative gaps.

## Working Copy & Persistence

- Maintain two schedules: `baselineTimeline` (server state) and `workingTimeline` (local edits). All interactions mutate the working copy.
- Save serializes the working copy, shows optimistic UI, and refreshes the baseline on success.
- Reset discards the working copy, rehydrating from the baseline without refreshing the page to maintain zoom/pan state.
- Dirty tracking is global; the Save/Reset toolbar remains pinned at the top so editors always see the draft status, regardless of scroll.

## UX States & Feedback

- Display a compact diff summary (e.g., “+3 shifts, −1 gap, 2 modified”) when the working copy diverges from baseline.
- Provide inline undo/redo for at least the last few boundary drags to recover from accidental bumps.
- When zoomed out enough that cards would compress into narrow bands, collapse them into labelled strips while preserving hit targets for selection.
- Use subtle animations when boundaries move to reinforce the causal relationship between the drag and the downstream bumps.

## Confirmed Decisions

- Save applies to the entire working timeline, not to individual selections.
- Dragging can extend the day in either direction; downstream items always move to make room rather than triggering warnings.
- Editors manipulate start and end times only; durations are derived from those values with a five-minute minimum per event (including breaks that participate in bumps).
- Gaps are treated as first-class buffers that absorb adjustments before later events are moved.
- Break-category entries can flex but maintain a five-minute minimum; any remaining delta continues down the tail after the break.

## Remaining Questions

- When a break shrinks to its five-minute floor, should the UI surface a specific warning or styling change so editors know they are out of slack? out of scope for now

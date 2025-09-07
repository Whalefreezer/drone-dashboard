# Admin UX and IA Proposals

Context: The current Admin page is accumulating multiple tools (KV viewer, server settings, ingest targets, etc.). This document proposes
scalable structures for navigation, layout, and extensibility as the admin surface grows.

## Goals

- Organize features so they are easy to discover and grow without clutter.
- Keep implementation simple, type‑safe, and consistent with existing patterns (TanStack Router, Jotai, GenericTable, Deno).
- Encourage reuse via schema/metadata where possible.
- Preserve performance with live PocketBase subscriptions.

## Constraints and Existing Pieces

- Router: TanStack Router (file‑based routes in `src/routes`).
- State: Jotai atoms over PocketBase subscriptions in `pbAtoms.ts`.
- Tables: `GenericTable` with column configs.
- Styling: Local CSS per route; dark theme.

## Option A — Sidebar Console (Sectioned Layout)

High‑level: Convert `/admin` to a layout with a persistent left sidebar and nested routes for each feature area.

- Layout: `AdminLayout` with slots for `Sidebar`, `Topbar`, `Outlet`.
- Navigation: Grouped links, e.g. Dashboard, Data, Ingest, Settings, Tools.
- Routing: `/admin/(dashboard|kv|ingest|settings|tools|...)` nested routes; lazy‑loaded pages.
- Page patterns: Each page uses a standard shell (header, actions row, content).
- Search & filters: Per‑page local filters; global search later.

Pros

- Familiar mental model; easy incremental migration.
- Encourages ownership boundaries between pages.
- Straightforward code splitting and subscription scoping per page.

Cons

- Cross‑feature workflows still require page hops.
- Page‑local filters/search may be duplicated across pages.

Suggested file structure

- `src/routes/admin/__layout.tsx` (AdminLayout)
- `src/routes/admin/index.tsx` (redirect → dashboard)
- `src/routes/admin/dashboard.tsx`
- `src/routes/admin/kv.tsx`
- `src/routes/admin/ingest.tsx`
- `src/routes/admin/settings.tsx`
- `src/routes/admin/tools.tsx`

## Option B — Workspaces (Entity‑Centric + Schema)

High‑level: Introduce “workspaces” for resource families (e.g., Data, Scheduling, System). Each workspace is an umbrella with tabs (List,
Inspect, Activity) and uses a small metadata registry to wire columns and editors for PB collections.

- Workspace shell: `WorkspaceLayout` (toolbar: scope, search, bulk actions, tab strip).
- Metadata registry: `admin/registry.ts` maps collection → columns, forms, preview, actions.
- Generic pages: `ResourceList`, `ResourceDetails`, `ResourceActivity` use registry to render.
- Deep‑linking: `/admin/w/:workspace/:collection` and `/admin/w/:workspace/:collection/:id`.

Pros

- Adding new resources becomes mostly metadata work.
- Consistent UX across resources; table/forms standardized.
- Enables cross‑resource bulk actions and saved views.

Cons

- Slightly higher upfront complexity (registry + shells).
- Requires discipline to define good defaults and escape hatches.

Registry sketch

```ts
// src/routes/admin/registry.ts
export const resources = {
	client_kv: {
		title: 'Client KV',
		columns: kvColumns, // reuse from ClientKVTable
		listHeight: 36,
		form: KVForm, // optional
		perms: ['admin'], // future: role gating
	},
	ingest_targets: {/* ... */},
	server_settings: {/* ... */},
} as const;
```

## Complementary Pattern — Command Palette

Add a global command palette (e.g., `Cmd/Ctrl + K`) that indexes admin routes, actions ("Add setting", "Toggle ingest"), and records. This
reduces reliance on deep menu structures and speeds power‑user workflows.

Implementation notes

- Lightweight: local list + fuzzy filter; or integrate down the road with a search service.
- Route helpers: palette items carry `to` and params for TanStack Router.

## Information Architecture (Suggested)

- Dashboard: Summary cards (current event, races in progress, errors, recent activity), quick links.
- Data: Collections: Events, Rounds, Races, Pilots, Channels, Client KV.
- Scheduling: Ingest Targets, Schedules, Queues.
- System: Server Settings, Logs (future), Health.
- Tools: Devtools, Scenario loader, Snapshots, Import/Export.

## UI/UX Guidelines

- Page shell: title, description, primary/secondary actions, filters, content, footer.
- Consistent table ergonomics: column presets, overflow fade, tooltips, fixed action column.
- Forms: small in‑row editors for simple resources; full drawer/modal for complex ones.
- Empty and error states: clear messaging, call‑to‑action.
- Keyboard access: tab order, shortcuts for save/reset, palette.

## Performance & Data Strategy

- Scope live subscriptions per page/route to avoid over‑fetching.
- Lazy‑load pages; prefetch on hover for sidebar items.
- Virtualize large tables if/when needed; keep `GenericTable` animation lightweight.
- Throttle expensive derived atoms; memoize table columns with stable deps.

## Permissions & Safety (Future‑proofing)

- Roles model (viewer/operator/admin) in PB; client reads role from auth session.
- Guard routes using a small `useRequireRole` hook and registry `perms`.
- Confirmations for destructive actions; optimistic UI with rollback.

## Theming & Layout

- Keep admin styles in `src/routes/admin.css` with CSS variables.
- Support narrow widths (collapsible sidebar) and large screens.
- Provide compact and comfortable density modes.

## Migration Plan (Incremental)

1. Introduce `AdminLayout` and move existing content into nested routes.
2. Split current monolithic page into `kv`, `settings`, `ingest`; add `dashboard` with summary cards.
3. Extract a minimal `registry.ts` and convert one resource (e.g., `client_kv`) to the registry.
4. Add command palette and a few common actions; iterate on workspace pages as needed.

## Component Inventory

- Layout: `AdminLayout`, `Sidebar`, `Topbar`, `ResourceList`, `ResourceDetails`, `Toolbar`.
- Tables: continue with `GenericTable` and column configs; add selection and bulk actions when needed.
- Forms: small editors (inline) and full editors (drawer/modal) per resource.

## Example Routes (TanStack Router)

```
/admin
  /dashboard
  /kv
  /ingest
  /settings
  /tools

# Workspace style
/admin/w/:workspace/:collection
/admin/w/:workspace/:collection/:id
```

## Quick Recommendation

Start with Option A (Sidebar Console) for immediate clarity and low friction. As the surface grows, fold in Option B (Workspaces + Registry)
to scale resource pages without bespoke code per collection. Add a command palette early to reduce navigation burden.

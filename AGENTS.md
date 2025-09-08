# Repository Guidelines

Quick Agent Rules
- Indent with tabs (deno fmt enforces this).
- After changes, run `deno task verify` locally.
- Do not leave legacy/back-compat shims; remove them in the same PR.
- When starting work on a GitHub issue, move it to "In progress" status to indicate active development.
- When listing GitHub issues, pass `state: OPEN` or `CLOSED` (uppercase) — using `open/closed` throws a `$states` error. For this repository, the owner is `Whalefreezer` and the repo is `drone-dashboard`.
- To manage issue dependencies: `gh api repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by` or `gh api repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocking` to get, `.../blocked_by --method POST -F "issue_id=1"` to add, or `--method DELETE` to `...dependencies/blocked_by/ISSUE_ID` to remove.

## Project Structure & Module Organization
- `frontend/`: Deno + React + Vite app. Source in `src/`, public assets in `public/`, tests co-located as `*.test.ts(x)`, production build in `dist/`.
- `backend/`: Go HTTP server that embeds `backend/static/` and proxies API calls. Entry point: `main.go`. Cross‑platform build scripts: `build.sh` / `build.bat`.
- `docs/`, `scripts/`, `.github/`: Auxiliary docs, scripts, and CI config.

## Build, Test, and Development Commands
- Frontend (run inside `frontend/`):
  - `deno task dev`: Start Vite dev server at `http://localhost:5173`.
  - `deno task build`: Build to `dist/` (assets later embedded by backend).
  - `deno task preview` or `deno task serve`: Preview/serve the production build.
  - `deno test` or `deno task test[:watch]`: Run unit/integration tests.
  - `deno fmt` / `deno lint`: Format and lint code.
- Backend (run inside `backend/`):
  - `go run main.go -fpvtrackside-api=http://localhost:8080 -port=3000`: Dev server with proxy at `/api/*`.
  - `./build.sh`: Produce binaries for Windows/Linux/macOS into `backend/build/` (uses UPX if available).
  - `go test ./...`: Run Go tests (add `*_test.go` as needed).

## Coding Style & Naming Conventions
- TypeScript/React: tabs for indentation, single quotes, ~100 char width (`deno fmt`). Components PascalCase (`RaceTimer.tsx`); hooks `useX`; tests `*.test.ts(x)`. Strong typing (avoid `any`), props via interfaces.
- Go: Idiomatic `gofmt`/`go vet`; package/file names lower-case; tests as `*_test.go`.
- See `CODING_STANDARDS.md` for patterns, examples, and architecture tips.


## Commit & Pull Request Guidelines
- Commits: Conventional Commits style — `type(scope): description` (e.g., `feat(leaderboard): add position change tags`).
- Branches: `<type>/<short-description>` (e.g., `fix/time-formatting`).
- PRs: Clear description, link issues, include screenshots/GIFs for UI changes, note breaking changes, and check that tests, lint, and build pass.

## Security & Configuration
- Copy `.env.example` → `.env`. Frontend uses Vite `VITE_*` vars; backend accepts flags `-fpvtrackside-api` and `-port`. Do not commit secrets.

## Worktree Helper
- Purpose: quickly spin up a worktree at `/tree/<name>` on branch `feat/<name>` and copy existing `.env*` files.
- Usage: `bash scripts/new-worktree.sh <name>` (or `chmod +x` once and run `scripts/new-worktree.sh <name>`).

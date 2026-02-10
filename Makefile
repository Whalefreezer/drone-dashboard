.PHONY: help dev fe-dev be-dev build fe-build be-build test fe-test be-test verify fe-verify be-verify e2e-verify preflight

help:
	@echo 'Available targets:'
	@echo '  make dev         - Run backend and frontend dev servers in parallel'
	@echo '  make fe-dev      - Run frontend dev server (frontend/)'
	@echo '  make be-dev      - Run backend server (backend/)'
	@echo '  make build       - Build frontend assets then backend binary'
	@echo '  make fe-build    - Build frontend assets into backend/static'
	@echo '  make be-build    - Build backend binary in backend/'
	@echo '  make test        - Run frontend and backend tests'
	@echo '  make verify      - Run frontend + e2e verify and backend vet'
	@echo '  make preflight   - Run repo preflight checks (e2e task)'

dev:
	@$(MAKE) -j2 fe-dev be-dev

fe-dev:
	cd frontend && deno task dev

be-dev:
	cd backend && go run main.go -fpvtrackside=http://localhost:8080 -port=3000

build: fe-build be-build

fe-build:
	cd frontend && deno task build

be-build:
	cd backend && go build -o drone-dashboard

test:
	@$(MAKE) -j2 fe-test be-test

fe-test:
	cd frontend && deno task test

be-test:
	cd backend && go test ./...

verify:
	@$(MAKE) -j3 fe-verify e2e-verify be-verify

fe-verify:
	cd frontend && deno task verify

e2e-verify:
	deno task -c e2e/deno.json verify

be-verify:
	cd backend && go vet ./...

preflight:
	deno task -c e2e/deno.json preflight

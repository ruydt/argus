LOCAL_BINARY := $(HOME)/.argus/bin/argus
DIST         := backend/internal/ui/dist

VERSION    := $(shell git describe --tags --always --dirty 2>/dev/null || echo "0.0.0-dev")
COMMIT     := $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS    := -X argus/internal/version.Version=$(VERSION) \
              -X argus/internal/version.Commit=$(COMMIT) \
              -X argus/internal/version.BuildDate=$(BUILD_DATE)

.PHONY: build-local clean verify verify-backend verify-frontend

# Build with version ldflags and hot-swap the running local service
build-local:
	cd frontend && pnpm run build
	cp -r frontend/dist/. $(DIST)/
	cd backend && go build -ldflags "$(LDFLAGS)" -o $(LOCAL_BINARY) ./cmd/server
	@echo "Built $(VERSION) → $(LOCAL_BINARY)"
	@PID=$$(lsof -ti:10804 2>/dev/null); \
	 if [ -n "$$PID" ]; then kill $$PID && sleep 0.5; fi
	@DB_PATH="$(HOME)/.argus/argus.db" ADDR="127.0.0.1:10804" \
	  nohup $(LOCAL_BINARY) >> $(HOME)/.argus/argus.log 2>&1 &
	@curl -s --retry 10 --retry-connrefused --retry-delay 1 --max-time 15 http://127.0.0.1:10804/api/version

clean:
	rm -rf frontend/dist
	find $(DIST) -not -name '.gitkeep' -delete

## verify — full local gate (backend + frontend), mirrors .github/workflows/ci.yml
verify: verify-backend verify-frontend

## verify-backend — build, vet, test, lint. Lint is skipped with a warning if
## golangci-lint is not installed (CI still enforces it).
verify-backend:
	cd backend && go build ./...
	cd backend && go vet ./...
	cd backend && go test ./...
	@if command -v golangci-lint >/dev/null 2>&1; then \
		cd backend && golangci-lint run ./...; \
	else \
		echo "WARNING: golangci-lint not installed — skipping backend lint."; \
		echo "         CI still enforces it. Install: brew install golangci-lint"; \
		echo "         (CI pins v2.12.2; see https://golangci-lint.run/welcome/install/)"; \
	fi

## verify-frontend — typecheck + lint + format check + tests (non-watch) + build
verify-frontend:
	cd frontend && pnpm run check
	cd frontend && pnpm run test -- --run
	cd frontend && pnpm run build

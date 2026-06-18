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

## verify-backend — build, vet, test, lint. Mirrors CI: lint is REQUIRED. The
## linter is found on PATH or in $(go env GOPATH)/bin; if absent, the gate fails.
verify-backend:
	cd backend && go build ./...
	cd backend && go vet ./...
	cd backend && go test ./...
	@GOLANGCI="$$(command -v golangci-lint || echo "$$(go env GOPATH)/bin/golangci-lint")"; \
	if [ -x "$$GOLANGCI" ]; then \
		echo "lint: $$GOLANGCI"; \
		cd backend && "$$GOLANGCI" run ./...; \
	else \
		echo "ERROR: golangci-lint not found (PATH or $$(go env GOPATH)/bin)." >&2; \
		echo "       CI enforces it (v2.12.2); 'make verify' must too." >&2; \
		echo "       Install: go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.12.2" >&2; \
		exit 1; \
	fi

## verify-frontend — typecheck + lint + format check + tests (non-watch) + build
verify-frontend:
	cd frontend && pnpm run check
	cd frontend && pnpm run test -- --run
	cd frontend && pnpm run build

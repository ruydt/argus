BINARY       := $(HOME)/.local/bin/hooker-monitor
LOCAL_BINARY := $(HOME)/.hooker/bin/hooker
PNPM         := /opt/homebrew/bin/pnpm
GO           := /opt/homebrew/bin/go
DIST         := backend/internal/ui/dist

VERSION   := $(shell git describe --tags --always --dirty 2>/dev/null || echo "0.0.0-dev")
COMMIT    := $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
BUILD_DATE := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS   := -X hooker/internal/version.Version=$(VERSION) \
             -X hooker/internal/version.Commit=$(COMMIT) \
             -X hooker/internal/version.BuildDate=$(BUILD_DATE)

.PHONY: build install build-local clean

build:
	cd frontend && $(PNPM) run build
	cp -r frontend/dist/. $(DIST)/
	cd backend && $(GO) build -o $(BINARY) ./cmd/server

install: build
	@echo "Installed to $(BINARY)"

# Build with version ldflags and hot-swap the running local service
build-local:
	cd frontend && $(PNPM) run build
	cp -r frontend/dist/. $(DIST)/
	cd backend && $(GO) build -ldflags "$(LDFLAGS)" -o $(LOCAL_BINARY) ./cmd/server
	@echo "Built $(VERSION) → $(LOCAL_BINARY)"
	@PID=$$(lsof -ti:10804 2>/dev/null); \
	 if [ -n "$$PID" ]; then kill $$PID && sleep 0.5; fi
	@DB_PATH="$(HOME)/.hooker/hooker.db" ADDR="127.0.0.1:10804" \
	  nohup $(LOCAL_BINARY) >> $(HOME)/.hooker/hooker.log 2>&1 &
	@sleep 1 && curl -s http://127.0.0.1:10804/api/version

clean:
	rm -rf frontend/dist
	find $(DIST) -not -name '.gitkeep' -delete

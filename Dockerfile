FROM node:22-alpine AS frontend-builder
WORKDIR /frontend
ENV CI=true
RUN npm install -g pnpm
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm run build

FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=frontend-builder /frontend/dist ./internal/ui/dist
ARG HOOKER_VERSION=0.0.0-dev
RUN go build -ldflags "-X hooker/internal/version.Version=${HOOKER_VERSION}" -o hooker-server ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/hooker-server .
# Container must bind 0.0.0.0 so compose can publish ports.
# docker-compose.yml maps to 127.0.0.1:8765 (host loopback only).
# Public internet exposure is unsupported — do not change ports: to 0.0.0.0.
ENV ADDR=0.0.0.0:8765
ENV HOOKER_ALLOW_REMOTE=1
EXPOSE 8765
CMD ["./hooker-server"]

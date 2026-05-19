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
RUN go build -o agent-monitor ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/agent-monitor .
EXPOSE 8765
CMD ["./agent-monitor"]

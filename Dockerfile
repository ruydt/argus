FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN go build -o agent-monitor ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/agent-monitor .
EXPOSE 8765
CMD ["./agent-monitor"]

FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN go build -o agent-monitor .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/agent-monitor .
COPY ui.html .
EXPOSE 8765
CMD ["./agent-monitor"]

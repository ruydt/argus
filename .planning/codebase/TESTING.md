# TESTING.md — Testing Patterns

**Last mapped:** 2026-05-05

---

## Status: No Tests

This codebase has **zero test files** in both backend and frontend.

---

## Backend (Go)

- Zero `*_test.go` files in `backend/` or `backend/internal/`
- No test dependencies in `go.mod` (module has zero external deps)
- No `testdata/` directories
- `go test ./...` would run nothing

---

## Frontend (TypeScript/React)

- Zero `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` files in `frontend/src/`
- No testing framework in `frontend/package.json`:
  - No vitest, jest, @testing-library, playwright, cypress
- No `test` script in `package.json` scripts (only: `dev`, `build`, `lint`, `preview`)

---

## CI/CD

- No CI configuration files detected (no `.github/workflows/`, no `.circleci/`, no `Makefile`)

---

## Implications for Planning

Any new phase that adds tests will be starting from scratch. No existing patterns, helpers, or conventions to follow. Recommended setup when tests are added:

**Backend:** Standard `go test` — no dependencies needed. Use table-driven tests (`t.Run`).

**Frontend:** Add vitest + @testing-library/react as dev dependencies. Component tests for `ClaudeSession`, `CodexSession`. Integration tests for polling logic in `Events.tsx`.

---
status: partial
phase: 03-mature-local-product
source: [03-VERIFICATION.md]
started: 2026-05-27T08:09:07Z
updated: 2026-05-27T08:09:07Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Doctor privacy warning

expected: Running `./scripts/hooker doctor` prints a privacy warning section listing all six captured-data categories: prompts, diffs, file paths, tool outputs, raw payloads, and exports.
result: [pending]

### 2. Remote bind startup rejection

expected: Starting the backend with `ADDR=0.0.0.0:8765` and no `HOOKER_ALLOW_REMOTE` set causes the process to exit immediately with an error message containing "refusing non-loopback ADDR" and "HOOKER_ALLOW_REMOTE=1".
result: [pending]

### 3. End-to-end privacy gate

expected: Creating `~/.config/hooker/ignore` with a matching path pattern, then sending a hook event whose `cwd` or `path` field matches, results in zero database rows and no SSE broadcast for that event. The backend logs show only safe metadata (agent/session/action/reason) without any raw payload, prompt text, or diff content.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

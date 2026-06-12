# Permission Notification — Design Spec

**Date:** 2026-06-06  
**Status:** Approved  
**Scope:** macOS native dialog intercept for `PermissionRequest` hook events

---

## Problem

When Claude Code or Codex needs user approval (permission check, `AskUserQuestion`), it blocks at
the terminal waiting for input. The developer must context-switch back to the terminal to respond.
There is no mechanism to answer from wherever they currently are.

---

## Goal

When argus receives a `PermissionRequest` hook, pop up a native macOS dialog so the developer can
approve, deny, or select an option without leaving their current app. Claude Code blocks on the hook
HTTP response, so the dialog intercepts the prompt entirely — the terminal never shows it.

---

## Non-Goals

- Linux support (future work — no-op fallback ships now)
- Argus UI changes (no frontend work required)
- Schema/migration changes (no new fields needed)

---

## Architecture

```
PermissionRequest hook fires
         │
         ▼
handler.Hook()
  ├─ normalize + svc.AddEvent()   ← store + SSE broadcast (unchanged)
  └─ HookEventName == "PermissionRequest"?
         │ yes
         ▼
  notifier.ShowPermissionDialog(ctx, event)
     spawns osascript subprocess
     blocks goroutine up to 60s
         │
         ├─ user responds ──────────────────────────────────────┐
         │                                                      │
         └─ timeout / dismiss ──→ Decision{Action: ""}          │
                                  handler writes {}             │
                                  Claude Code falls through     │
                                  to terminal prompt            │
                                                                ▼
                                               Decision{Action: "approve"}
                                               Decision{Action: "block", Reason: "..."}
                                               handler writes JSON response
                                               Claude Code proceeds / blocks
```

Storage and SSE broadcast happen **before** the dialog blocks, so the argus UI reflects the event
in real time regardless of outcome.

---

## Trigger Condition

Single condition: `HookEventName == "PermissionRequest"`

Two subtypes based on `tool_name`:

| `tool_name`        | Dialog type       | osascript command       |
|--------------------|-------------------|-------------------------|
| `AskUserQuestion`  | Multi-option list | `choose from list`      |
| anything else      | Approve / Deny    | `display dialog`        |

`PermissionDenied` events are post-fact notifications — not intercepted, no dialog shown.

---

## New Package: `internal/notify`

```
backend/internal/notify/
├── notify.go          — types + Notifier interface
├── notify_darwin.go   — osascript implementation  (//go:build darwin)
└── notify_other.go    — no-op fallback            (//go:build !darwin)
```

### Types

```go
// Decision is the result of a user interaction with the permission dialog.
type Decision struct {
    Action string // "approve", "block", or "" (fall through / timeout)
    Reason string // populated when Action == "block"
}

// Notifier shows a native OS dialog for permission events and returns the user's decision.
type Notifier interface {
    ShowPermissionDialog(ctx context.Context, e domain.NormalizedEvent) (Decision, error)
}
```

### Darwin Implementation

Executes `osascript -e <script>` via `exec.CommandContext` with a 60-second deadline inherited
from the request context.

**AskUserQuestion dialog:**

```applescript
choose from list {"Option A", "Option B", "Option C"}
  with title "Claude Code — Question"
  with prompt "What do you mean by 'not live'?"
  default items {"Option A"}
```

- Options populated from `ToolInputQuestionsJSON[0].options[].label`
- Question text from `ToolInputQuestionsJSON[0].question`
- If multiple questions exist, show the first; fall through for the rest
- User selects → `Decision{Action: "block", Reason: "User selected: <label>"}`
  (blocks `AskUserQuestion` tool from running, model reads selected answer from reason)
- User cancels → `Decision{Action: ""}` (fall through to terminal)

**Approve/Deny dialog:**

```applescript
display dialog "Allow Bash?\n\ncmd: rm -rf node_modules"
  buttons {"Deny", "Approve"}
  default button "Approve"
  giving up after 60
  with title "Claude Code — Permission"
```

- Tool name from `e.Tool`, command/description from `e.Command` or `e.Description`
- `"Approve"` button → `Decision{Action: "approve"}`
- `"Deny"` button → `Decision{Action: "block", Reason: "Denied via notification"}`
- Gave up (timeout) → `Decision{Action: ""}` (fall through)

### No-op Fallback (`notify_other.go`)

```go
func (n *NoopNotifier) ShowPermissionDialog(_ context.Context, _ domain.NormalizedEvent) (Decision, error) {
    return Decision{}, nil
}
```

Returns empty decision — handler writes `{}` and Claude Code falls through to terminal prompt.

---

## Handler Change (`handler/hook.go`)

`Notifier` is passed directly into the `Hook` handler function — no changes to the service layer:

```go
func Hook(svc *service.EventService, matcher IgnoreMatcher, notifier notify.Notifier) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // ... existing normalize + AddEvent logic ...

        if e.HookEventName == "PermissionRequest" && notifier != nil {
            decision, err := notifier.ShowPermissionDialog(r.Context(), e)
            if err == nil && decision.Action != "" {
                w.Header().Set("Content-Type", "application/json")
                _ = json.NewEncoder(w).Encode(decisionToResponse(decision))
                return
            }
        }
        // existing fall-through: write {}
    })
}
```

`decisionToResponse` maps `Decision` to Claude Code hook response JSON:

| Decision.Action | Response JSON                                              |
|-----------------|------------------------------------------------------------|
| `"approve"`     | `{"decision": "approve"}`                                 |
| `"block"`       | `{"decision": "block", "reason": "<Decision.Reason>"}`    |
| `""`            | `{}`                                                      |

### Wiring (`cmd/server/main.go`)

```go
// darwin: real notifier
var notifier notify.Notifier = notify.NewDarwinNotifier()

// linux / other: pass nil — handler falls through for all permission events
router.Handle("/api/hook", handler.Hook(svc, matcher, notifier))
```

`Notifier` interface lives in `internal/notify` — no service layer changes.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `osascript` binary missing | `exec.LookPath` fails → return `Decision{}`, fall through |
| osascript crashes / non-zero exit | treated as cancel → `Decision{}`, fall through |
| User dismisses dialog (Escape) | osascript exits non-zero → `Decision{}`, fall through |
| `ToolInputQuestionsJSON` malformed | fallback: `display dialog` showing tool name only |
| Multiple concurrent dialogs | each subprocess independent; macOS stacks dialogs naturally |
| Request context cancelled | `exec.CommandContext` kills subprocess; return `Decision{}` |

---

## Testing

### `internal/notify` package

- Inject a fake `osascript` shell script via `PATH` override in tests
- Fake script echoes canned responses (`"Approve"`, `"Deny"`, `"button returned:Approve, gave up:true"`)
- Assert `Decision` fields for each case
- Build-tagged: darwin tests only

### Handler tests

- Add mock `Notifier` implementation satisfying the interface
- New test cases in `tests/internal/handler/hook_test.go`:
  - `PermissionRequest` + approve decision → response body `{"decision":"approve"}`
  - `PermissionRequest` + block decision → response body `{"decision":"block","reason":"..."}`
  - `PermissionRequest` + timeout (empty decision) → response body `{}`
  - Non-permission event → response body `{}` unchanged
- No new migration, no frontend changes

---

## Out of Scope / Future Work

- **Linux**: `notify-send` or `zenity` implementation behind `!darwin` build tag
- **Multi-question AskUserQuestion**: currently shows first question only; could loop through all
- **AskUserQuestion answer injection**: if Claude Code adds a hook protocol field for supplying
  answers directly (vs. block+reason), update `decisionToResponse` to use it
- **Configurable timeout**: `ARGUS_NOTIFY_TIMEOUT` env var (currently hardcoded 60s)
- **Notification history**: persist dialog outcomes alongside the event record

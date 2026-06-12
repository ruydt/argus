# Session Project Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the project (shortened cwd) each session belongs to in the Events page session list header.

**Architecture:** Frontend-only. `SessionGroup` gains a required `cwd` field populated during grouping in `SessionList.tsx` (first non-empty event cwd wins); `AgentSession.tsx` renders a muted plain-text `shortenCwd(cwd)` label with the full path as hover title.

**Tech Stack:** React 19, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-11-session-project-label-design.md`

**Repo rules:** prettier (no semis, single quotes, 100 width) + `npx tsc --noEmit` + `npx vitest run` before done. Stage ONLY listed files (repo has unrelated uncommitted changes). Commits to `main` consented; trailer required.

---

### Task 1: Project label in session header

**Files:**
- Modify: `frontend/src/types/events.ts` (SessionGroup)
- Modify: `frontend/src/features/events/SessionList.tsx` (grouping)
- Modify: `frontend/src/features/events/AgentSession.tsx` (header label)
- Modify: `frontend/tests/features/events/AgentSession.test.tsx` (buildSession + 2 new tests)

- [ ] **Step 1: Write the failing tests**

In `frontend/tests/features/events/AgentSession.test.tsx`:

a) `buildSession` returns an object literal missing the new required `cwd` — add `cwd: ''` to the literal (before `events:`):

```ts
function buildSession(overrides: Partial<SessionGroup> = {}): SessionGroup {
  return {
    sessionId: 'test-session-abc123',
    transcriptPath: '/home/user/.claude/test',
    cwd: '',
    events: [
      // ... unchanged ...
    ],
    ...overrides,
  }
}
```

b) Append two tests inside the existing `describe` (or at top level matching file style):

```tsx
it('shows shortened project cwd in the header', () => {
  renderSession({ session: buildSession({ cwd: '/Users/dev/GitHub/argus' }) })
  const label = screen.getByText('~/GitHub/argus')
  expect(label).toBeInTheDocument()
  expect(label).toHaveAttribute('title', '/Users/dev/GitHub/argus')
})

it('omits project label when session has no cwd', () => {
  renderSession({ session: buildSession({ cwd: '' }) })
  expect(screen.queryByText(/^~\//)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd frontend && npx vitest run tests/features/events/AgentSession.test.tsx`
Expected: FAIL — tsc error on `cwd` not in `SessionGroup` (or text not found once type added). Either failure mode is the correct red state.

- [ ] **Step 3: Add `cwd` to SessionGroup**

In `frontend/src/types/events.ts`:

```ts
export interface SessionGroup {
  sessionId: string
  transcriptPath: string
  cwd: string
  events: EventRecord[]
}
```

- [ ] **Step 4: Populate cwd during grouping**

In `frontend/src/features/events/SessionList.tsx`, inside the `events.forEach` grouping loop:

```ts
    events.forEach((event) => {
      const key = event.session || event.transcript_path || 'ungrouped'
      const existing = grouped.get(key)

      if (existing) {
        existing.events.push(event)
        if (!existing.cwd && event.cwd) existing.cwd = event.cwd
        return
      }

      grouped.set(key, {
        sessionId: key,
        transcriptPath: event.transcript_path ?? '',
        cwd: event.cwd ?? '',
        events: [event],
      })
    })
```

- [ ] **Step 5: Render label in AgentSession header**

In `frontend/src/features/events/AgentSession.tsx`:

a) Import (goes in the shared-lib/feature import group; `@/features/sessions/utils` is a cross-feature single-source helper):

```ts
import { shortenCwd } from '@/features/sessions/utils'
```

b) Destructure `cwd` from session — change:

```ts
  const { sessionId, transcriptPath, events } = session
```

to:

```ts
  const { sessionId, transcriptPath, cwd, events } = session
```

c) In the header, directly after the session-id `<span>…</span>` (the one wrapping `highlight(firstEvent.session || shortId(transcriptPath), searchQuery)`) and before `<CopyIconButton`:

```tsx
            {cwd !== '' && (
              <span
                title={cwd}
                className="shrink-0 max-w-[180px] truncate text-[0.68rem] font-normal text-[#666]"
              >
                {shortenCwd(cwd)}
              </span>
            )}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd frontend && npx vitest run tests/features/events/`
Expected: all PASS (new 2 included)

- [ ] **Step 7: Full frontend verification**

Run: `cd frontend && npx prettier --write src/types/events.ts src/features/events/SessionList.tsx src/features/events/AgentSession.tsx tests/features/events/AgentSession.test.tsx && npx tsc --noEmit && npx vitest run`
Expected: formatted, no type errors, full suite green (225+2)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/events.ts frontend/src/features/events/SessionList.tsx frontend/src/features/events/AgentSession.tsx frontend/tests/features/events/AgentSession.test.tsx
git commit -m "feat: show project cwd label in events session headers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

import { test, expect, request } from '@playwright/test'

// Fixture payloads that exercise the full ingest path (D-09).
// Shapes must match the actual domain.RawPayload fields read by each normalizer.
// Claude Code: transcript_path contains /.claude/ → claudecode.Normalize() reads tool_name + tool_input.command.
// Codex: transcript_path does NOT contain /.claude/ → codex.Normalize() reads tool_name + tool_input.command.
const claudeCodeFixture = {
  session_id: 'smoke-cc-01',
  transcript_path: '/home/user/.claude/projects/hooker-smoke/transcript.jsonl',
  hook_event_name: 'PreToolUse',
  turn_id: 'turn-smoke-01',
  tool_use_id: 'tuse-smoke-01',
  tool_name: 'Bash',
  cwd: '/tmp',
  tool_input: { command: 'echo hello' },
}

const codexFixture = {
  session_id: 'smoke-codex-01',
  transcript_path: '/tmp/codex-smoke.jsonl',
  hook_event_name: 'PreToolUse',
  turn_id: 'turn-codex-01',
  tool_use_id: 'tuse-codex-01',
  tool_name: 'shell',
  cwd: '/tmp',
  tool_input: { command: 'echo world' },
}

test.beforeAll(async () => {
  const api = await request.newContext({ baseURL: 'http://127.0.0.1:8765' })
  const r1 = await api.post('/api/hook', { data: claudeCodeFixture })
  if (!r1.ok()) {
    throw new Error(`Failed to POST claudecode fixture: ${r1.status()}`)
  }
  const r2 = await api.post('/api/hook', { data: codexFixture })
  if (!r2.ok()) {
    throw new Error(`Failed to POST codex fixture: ${r2.status()}`)
  }
  await api.dispose()
})

test('events page shows at least one event row', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-testid="event-row"]').first()).toBeVisible()
})

test('projects page shows at least one project', async ({ page }) => {
  await page.goto('/projects')
  await expect(page.locator('[data-testid="project-card"]').first()).toBeVisible()
})

test('dashboard page shows stat values', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.locator('[data-testid="stat-value"]').first()).toBeVisible()
})

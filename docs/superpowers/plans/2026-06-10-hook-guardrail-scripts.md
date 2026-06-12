# Hook Guardrail Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three standalone hook scripts to `my-custom-hook-scripts/` — a dangerous-command blocker, a secrets file-access guard, and an argus-powered cost warning — plus test fixtures and a README.

**Architecture:** Each script is a fully standalone, zero-dependency Node.js file following the existing collection conventions (see `my-custom-hook-scripts/permission-request.js`): shebang `#!/usr/bin/env node`, copied helpers (`readStdin`, `parsePayload`, `logScript`), logging to `~/.argus/hook-scripts.log`, agent detection via `CLAUDECODE=1` env var, fail-open on any error. Blockers run on PreToolUse and emit Claude Code deny JSON (or exit 2 + stderr for Codex). The cost warning runs on SessionStart and queries `~/.argus/argus.db` via the `sqlite3` CLI.

**Tech Stack:** Node.js (no npm packages), `sqlite3` CLI, Claude Code / Codex hook protocol.

**Spec:** `docs/superpowers/specs/2026-06-10-hook-guardrail-scripts-design.md`

**Spec deviation (approved rationale):** The cost-warn query uses `last_seen_at` with epoch comparison (`strftime('%s', ...)`) instead of the spec's `started_at >= datetime('now','-5 hours')`. Verified against the live DB: argus stores RFC3339 timestamps (`2026-06-10T15:45:51Z`) while `datetime()` emits space-separated strings, so naive string comparison counts the whole day (22M tokens) instead of the 5-hour window (2.2M). `last_seen_at` also counts long-running sessions still active in the window.

**Testing model:** No test framework — each script is verified by piping committed JSON fixtures into it and asserting stdout/exit code, mirroring how the agents invoke hooks. Fixture-first ordering approximates TDD: create fixture, run (fails: no script), write script, run again, assert.

---

### Task 1: `block-dangerous.js` — dangerous-command blocker

**Files:**
- Create: `my-custom-hook-scripts/fixtures/bash-dangerous.json`
- Create: `my-custom-hook-scripts/fixtures/bash-safe.json`
- Create: `my-custom-hook-scripts/block-dangerous.js`

- [ ] **Step 1: Create fixtures**

`my-custom-hook-scripts/fixtures/bash-dangerous.json`:

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf ~" },
  "transcript_path": "/Users/duytran/.claude/projects/test/session.jsonl"
}
```

`my-custom-hook-scripts/fixtures/bash-safe.json`:

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "ls -la && git status" },
  "transcript_path": "/Users/duytran/.claude/projects/test/session.jsonl"
}
```

- [ ] **Step 2: Verify script does not exist yet (test fails)**

Run: `CLAUDECODE=1 node my-custom-hook-scripts/block-dangerous.js < my-custom-hook-scripts/fixtures/bash-dangerous.json`
Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Write the script**

`my-custom-hook-scripts/block-dangerous.js`:

```js
#!/usr/bin/env node
// PreToolUse hook (matcher: Bash): blocks dangerous shell commands for Claude Code and Codex.
// Deny + reason so the agent can self-correct. Fail-open: any script error exits 0 silently.
// Config (optional): ~/.argus/dangerous-patterns.json { "extra": ["<regex>"], "allow": ["<regex>"] }

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'dangerous-patterns.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const isClaudeCode = process.env.CLAUDECODE === '1';

const DANGEROUS = [
  {
    re: /\brm\s+[^|;&]*-[a-zA-Z]*[rR][a-zA-Z]*\s+([^|;&]*\s)?['"]?(\/|~\/?|\$HOME\b|\.\.?)['"]?(\s|$)/,
    why: 'recursive rm targeting /, ~, $HOME, or the current directory',
  },
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, why: 'fork bomb' },
  {
    re: /\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/,
    why: 'piping a remote script directly into a shell',
  },
  { re: /\bchmod\s+(-[a-zA-Z]+\s+)*777\b/, why: 'chmod 777 (world-writable permissions)' },
  {
    re: /\bgit\s+push\b[^|;&]*(--force\b|\s-f\b)[^|;&]*\b(main|master)\b|\bgit\s+push\b[^|;&]*\b(main|master)\b[^|;&]*(--force\b|\s-f\b)/,
    why: 'force push to main/master',
  },
  { re: /\bDROP\s+(DATABASE|TABLE)\b/i, why: 'SQL DROP statement' },
  { re: /\bdd\b[^|;&]*\bof=\/dev\/(sd|hd|disk|nvme)/, why: 'dd writing to a raw device' },
  { re: /\bmkfs(\.\w+)?\b/, why: 'filesystem format command' },
  { re: />\s*\/dev\/(sd|hd|disk|nvme)\w*/, why: 'redirect to a raw device' },
];

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} block-dangerous.js ${level} ${msg}\n`);
  } catch (_) {}
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function parsePayload(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function ellipsis(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function toRegexList(values) {
  const out = [];
  if (!Array.isArray(values)) return out;
  for (const value of values) {
    if (typeof value !== 'string' || !value) continue;
    try {
      out.push(new RegExp(value));
    } catch (_) {
      logScript('WARN', `invalid config regex skipped: ${ellipsis(value, 80)}`);
    }
  }
  return out;
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { extra: toRegexList(parsed.extra), allow: toRegexList(parsed.allow) };
  } catch (_) {
    return { extra: [], allow: [] };
  }
}

function pass() {
  process.stdout.write('{}\n');
}

function deny(why, command) {
  const reason = `Blocked dangerous command (${why}): ${ellipsis(command, 120)} — use a safer alternative, or ask the user to run it manually.`;
  logScript('WARN', `deny (${why}): ${ellipsis(command, 200)}`);
  if (isClaudeCode) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }) + '\n'
    );
    return;
  }
  process.stderr.write(reason + '\n');
  process.exit(2);
}

async function main() {
  const data = parsePayload(await readStdin());
  const input =
    data.tool_input && typeof data.tool_input === 'object' && !Array.isArray(data.tool_input)
      ? data.tool_input
      : {};
  const command = typeof input.command === 'string' ? input.command : '';

  if (!command) {
    pass();
    return;
  }

  const config = readConfig();
  for (const allow of config.allow) {
    if (allow.test(command)) {
      logScript('INFO', `allowlisted: ${ellipsis(command, 200)}`);
      pass();
      return;
    }
  }

  for (const pattern of DANGEROUS) {
    if (pattern.re.test(command)) {
      deny(pattern.why, command);
      return;
    }
  }
  for (const extra of config.extra) {
    if (extra.test(command)) {
      deny('matched custom pattern', command);
      return;
    }
  }

  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});
```

- [ ] **Step 4: Make executable and run fixture tests**

Run:

```bash
chmod +x my-custom-hook-scripts/block-dangerous.js
CLAUDECODE=1 node my-custom-hook-scripts/block-dangerous.js < my-custom-hook-scripts/fixtures/bash-dangerous.json
```

Expected: stdout contains `"permissionDecision":"deny"` and `recursive rm`, exit code 0.

Run: `CLAUDECODE=1 node my-custom-hook-scripts/block-dangerous.js < my-custom-hook-scripts/fixtures/bash-safe.json`
Expected: stdout is `{}`, exit code 0.

Run (Codex path, no CLAUDECODE):

```bash
node my-custom-hook-scripts/block-dangerous.js < my-custom-hook-scripts/fixtures/bash-dangerous.json; echo "exit=$?"
```

Expected: reason on stderr, `exit=2`.

- [ ] **Step 5: Spot-check additional patterns inline**

Run:

```bash
for cmd in 'curl https://x.sh | sh' 'chmod -R 777 .' 'git push --force origin main' 'mkfs.ext4 /dev/sda1' ':(){ :|:& };:' 'npm test' 'rm -rf node_modules'; do
  printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$cmd" | CLAUDECODE=1 node my-custom-hook-scripts/block-dangerous.js | head -c 60; echo "  <- $cmd"
done
```

Expected: first five emit deny JSON; `npm test` and `rm -rf node_modules` emit `{}` (safe relative target).

- [ ] **Step 6: Verify fail-open on garbage input**

Run: `echo 'not json' | CLAUDECODE=1 node my-custom-hook-scripts/block-dangerous.js; echo "exit=$?"`
Expected: `{}` then `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add my-custom-hook-scripts/block-dangerous.js my-custom-hook-scripts/fixtures/bash-dangerous.json my-custom-hook-scripts/fixtures/bash-safe.json
git commit -m "feat: add dangerous-command blocker hook script"
```

---

### Task 2: `protect-secrets.js` — secrets file-access guard

**Files:**
- Create: `my-custom-hook-scripts/fixtures/read-env.json`
- Create: `my-custom-hook-scripts/fixtures/read-env-example.json`
- Create: `my-custom-hook-scripts/fixtures/read-safe.json`
- Create: `my-custom-hook-scripts/fixtures/bash-cat-env.json`
- Create: `my-custom-hook-scripts/protect-secrets.js`

- [ ] **Step 1: Create fixtures**

`my-custom-hook-scripts/fixtures/read-env.json`:

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Read",
  "tool_input": { "file_path": "/Users/duytran/project/.env" },
  "transcript_path": "/Users/duytran/.claude/projects/test/session.jsonl"
}
```

`my-custom-hook-scripts/fixtures/read-env-example.json`:

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Read",
  "tool_input": { "file_path": "/Users/duytran/project/.env.example" },
  "transcript_path": "/Users/duytran/.claude/projects/test/session.jsonl"
}
```

`my-custom-hook-scripts/fixtures/read-safe.json`:

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Read",
  "tool_input": { "file_path": "/Users/duytran/project/src/index.ts" },
  "transcript_path": "/Users/duytran/.claude/projects/test/session.jsonl"
}
```

`my-custom-hook-scripts/fixtures/bash-cat-env.json`:

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "cat .env | grep API_KEY" },
  "transcript_path": "/Users/duytran/.claude/projects/test/session.jsonl"
}
```

- [ ] **Step 2: Verify script does not exist yet (test fails)**

Run: `CLAUDECODE=1 node my-custom-hook-scripts/protect-secrets.js < my-custom-hook-scripts/fixtures/read-env.json`
Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Write the script**

`my-custom-hook-scripts/protect-secrets.js`:

```js
#!/usr/bin/env node
// PreToolUse hook (matcher: Read|Edit|Write|Bash): blocks access to secret files
// for Claude Code and Codex. For file tools it checks tool_input.file_path; for Bash
// it tokenizes the command and checks each token. Fail-open on any script error.
// Config (optional): ~/.argus/protected-paths.json { "extra": ["<regex>"], "allow": ["<regex>"] }

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'protected-paths.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const isClaudeCode = process.env.CLAUDECODE === '1';

// Checked before PROTECTED — first match wins.
const DEFAULT_ALLOW = [/\.env\.(example|sample|template)$/];

const PROTECTED = [
  { re: /(^|\/)\.env(\.[^/]*)?$/, why: '.env file' },
  { re: /\.pem$/, why: 'PEM certificate/key' },
  { re: /\.key$/, why: 'private key file' },
  { re: /(^|\/)id_rsa[^/]*$/, why: 'SSH RSA key' },
  { re: /(^|\/)id_ed25519[^/]*$/, why: 'SSH Ed25519 key' },
  { re: /(^|\/)\.ssh(\/|$)/, why: '~/.ssh directory' },
  { re: /(^|\/)\.aws(\/|$)/, why: '~/.aws directory' },
  { re: /(^|\/)\.config\/gh(\/|$)/, why: 'GitHub CLI config' },
  { re: /(^|\/)\.netrc$/, why: '.netrc credentials' },
  { re: /\.p12$/, why: 'PKCS#12 keystore' },
  { re: /(^|\/)secrets\.[^/]+$/, why: 'secrets file' },
];

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} protect-secrets.js ${level} ${msg}\n`);
  } catch (_) {}
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function parsePayload(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function ellipsis(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function toRegexList(values) {
  const out = [];
  if (!Array.isArray(values)) return out;
  for (const value of values) {
    if (typeof value !== 'string' || !value) continue;
    try {
      out.push(new RegExp(value));
    } catch (_) {
      logScript('WARN', `invalid config regex skipped: ${ellipsis(value, 80)}`);
    }
  }
  return out;
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { extra: toRegexList(parsed.extra), allow: toRegexList(parsed.allow) };
  } catch (_) {
    return { extra: [], allow: [] };
  }
}

function pass() {
  process.stdout.write('{}\n');
}

function deny(why, target) {
  const reason = `Blocked access to protected file (${why}): ${ellipsis(target, 120)} — this file may contain secrets. Ask the user to handle it manually if access is required.`;
  logScript('WARN', `deny (${why}): ${ellipsis(target, 200)}`);
  if (isClaudeCode) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }) + '\n'
    );
    return;
  }
  process.stderr.write(reason + '\n');
  process.exit(2);
}

// Returns { why } when the candidate path matches a protected pattern, else null.
function matchProtected(candidate, config) {
  for (const allow of DEFAULT_ALLOW.concat(config.allow)) {
    if (allow.test(candidate)) return null;
  }
  for (const pattern of PROTECTED) {
    if (pattern.re.test(candidate)) return { why: pattern.why };
  }
  for (const extra of config.extra) {
    if (extra.test(candidate)) return { why: 'matched custom pattern' };
  }
  return null;
}

async function main() {
  const data = parsePayload(await readStdin());
  const tool = typeof data.tool_name === 'string' ? data.tool_name.toLowerCase() : '';
  const input =
    data.tool_input && typeof data.tool_input === 'object' && !Array.isArray(data.tool_input)
      ? data.tool_input
      : {};
  const config = readConfig();

  if (tool === 'bash' || tool === 'shell') {
    const command = typeof input.command === 'string' ? input.command : '';
    const tokens = command.split(/[\s;|&<>()'"`]+/).filter(Boolean);
    for (const token of tokens) {
      const hit = matchProtected(token, config);
      if (hit) {
        deny(hit.why, command);
        return;
      }
    }
    pass();
    return;
  }

  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) {
    pass();
    return;
  }
  const hit = matchProtected(filePath, config);
  if (hit) {
    deny(hit.why, filePath);
    return;
  }
  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});
```

- [ ] **Step 4: Make executable and run fixture tests**

Run:

```bash
chmod +x my-custom-hook-scripts/protect-secrets.js
CLAUDECODE=1 node my-custom-hook-scripts/protect-secrets.js < my-custom-hook-scripts/fixtures/read-env.json
```

Expected: deny JSON containing `.env file`.

Run: `CLAUDECODE=1 node my-custom-hook-scripts/protect-secrets.js < my-custom-hook-scripts/fixtures/read-env-example.json`
Expected: `{}` (allowlisted).

Run: `CLAUDECODE=1 node my-custom-hook-scripts/protect-secrets.js < my-custom-hook-scripts/fixtures/read-safe.json`
Expected: `{}`.

Run: `CLAUDECODE=1 node my-custom-hook-scripts/protect-secrets.js < my-custom-hook-scripts/fixtures/bash-cat-env.json`
Expected: deny JSON containing `.env file`.

Run (Codex path):

```bash
node my-custom-hook-scripts/protect-secrets.js < my-custom-hook-scripts/fixtures/read-env.json; echo "exit=$?"
```

Expected: reason on stderr, `exit=2`.

- [ ] **Step 5: Spot-check additional patterns inline**

Run:

```bash
for fp in '/Users/x/.ssh/id_rsa' '/Users/x/.aws/credentials' '/Users/x/app/server.pem' '/Users/x/app/src/main.go' '/Users/x/app/key.test.ts'; do
  printf '{"tool_name":"Read","tool_input":{"file_path":"%s"}}' "$fp" | CLAUDECODE=1 node my-custom-hook-scripts/protect-secrets.js | head -c 60; echo "  <- $fp"
done
```

Expected: first three deny; `main.go` and `key.test.ts` emit `{}` (`.key$` must not match `key.test.ts`).

- [ ] **Step 6: Verify fail-open on garbage input**

Run: `echo 'not json' | CLAUDECODE=1 node my-custom-hook-scripts/protect-secrets.js; echo "exit=$?"`
Expected: `{}` then `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add my-custom-hook-scripts/protect-secrets.js my-custom-hook-scripts/fixtures/read-env.json my-custom-hook-scripts/fixtures/read-env-example.json my-custom-hook-scripts/fixtures/read-safe.json my-custom-hook-scripts/fixtures/bash-cat-env.json
git commit -m "feat: add secrets file-access guard hook script"
```

---

### Task 3: `cost-warn.js` — argus-powered session cost warning

**Files:**
- Create: `my-custom-hook-scripts/fixtures/session-start.json`
- Create: `my-custom-hook-scripts/cost-warn.js`

- [ ] **Step 1: Create fixture**

`my-custom-hook-scripts/fixtures/session-start.json`:

```json
{
  "hook_event_name": "SessionStart",
  "source": "startup",
  "transcript_path": "/Users/duytran/.claude/projects/test/session.jsonl"
}
```

- [ ] **Step 2: Verify script does not exist yet (test fails)**

Run: `CLAUDECODE=1 node my-custom-hook-scripts/cost-warn.js < my-custom-hook-scripts/fixtures/session-start.json`
Expected: FAIL with `Cannot find module`

- [ ] **Step 3: Write the script**

Note the timestamp subtlety: argus stores RFC3339 (`2026-06-10T15:45:51Z`) but SQLite's `datetime()` emits `YYYY-MM-DD HH:MM:SS`, so direct string comparison is wrong. The query converts both sides to epoch seconds with `strftime('%s', ...)` — this was verified against the live DB.

`my-custom-hook-scripts/cost-warn.js`:

```js
#!/usr/bin/env node
// SessionStart hook: warns when token usage in the rolling 5-hour window crosses a
// threshold, using the local argus database. Approximates the billing window — it
// does not track exact billing-block boundaries. Silent when under the warn level
// or when the database is unavailable (fail-open).
// Config (optional): ~/.argus/cost-warn.json { "threshold_tokens": 5000000, "warn_pct": 80 }

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const DB_FILE = path.join(os.homedir(), '.argus', 'argus.db');
const CONFIG_FILE = path.join(os.homedir(), '.argus', 'cost-warn.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const isClaudeCode = process.env.CLAUDECODE === '1';

const DEFAULTS = { threshold_tokens: 5000000, warn_pct: 80 };

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} cost-warn.js ${level} ${msg}\n`);
  } catch (_) {}
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      threshold_tokens:
        Number.isFinite(parsed.threshold_tokens) && parsed.threshold_tokens > 0
          ? parsed.threshold_tokens
          : DEFAULTS.threshold_tokens,
      warn_pct:
        Number.isFinite(parsed.warn_pct) && parsed.warn_pct > 0 && parsed.warn_pct <= 100
          ? parsed.warn_pct
          : DEFAULTS.warn_pct,
    };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return String(n);
}

function emit(msg) {
  if (isClaudeCode) {
    process.stdout.write(JSON.stringify({ systemMessage: msg }) + '\n');
  } else {
    process.stdout.write(msg + '\n');
  }
}

function main() {
  const config = readConfig();

  // Epoch comparison: argus stores RFC3339 ("...T...Z"), datetime() emits space-separated —
  // naive string comparison would match the whole day instead of the 5-hour window.
  const query =
    "SELECT COALESCE(SUM(input_tokens + output_tokens + cache_creation_tokens), 0), COUNT(*) " +
    "FROM sessions WHERE strftime('%s', last_seen_at) >= strftime('%s', 'now', '-5 hours')";

  let total = 0;
  let sessions = 0;
  try {
    const result = execSync(`sqlite3 "${DB_FILE}" "${query}"`, {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    const [totalRaw, sessionsRaw] = result.split('|');
    total = parseInt(totalRaw, 10) || 0;
    sessions = parseInt(sessionsRaw, 10) || 0;
  } catch (_) {
    logScript('WARN', 'argus db unavailable, staying silent');
    return;
  }

  const warnLevel = Math.floor((config.threshold_tokens * config.warn_pct) / 100);
  const pct = Math.round((total / config.threshold_tokens) * 100);
  logScript('INFO', `window total=${total} sessions=${sessions} pct=${pct}`);

  if (total < warnLevel) return;

  emit(
    `⚠ Token usage high: ${formatTokens(total)} of ${formatTokens(config.threshold_tokens)} threshold (${pct}%) across ${sessions} session(s) in the last 5h window.`
  );
}

try {
  main();
} catch (_) {
  logScript('ERROR', 'script failure, failing open');
}
```

- [ ] **Step 4: Make executable, test silent path with defaults**

Run:

```bash
chmod +x my-custom-hook-scripts/cost-warn.js
CLAUDECODE=1 node my-custom-hook-scripts/cost-warn.js < my-custom-hook-scripts/fixtures/session-start.json; echo "exit=$?"
```

Expected: no output (current window usage is under the 4M warn level) and `exit=0`. If your live usage is actually over threshold, output appears — check `~/.argus/hook-scripts.log` for the logged `window total=` line to confirm which case you're in.

- [ ] **Step 5: Test warning path with a tiny threshold**

Run:

```bash
printf '{ "threshold_tokens": 1000, "warn_pct": 50 }' > ~/.argus/cost-warn.json
CLAUDECODE=1 node my-custom-hook-scripts/cost-warn.js < my-custom-hook-scripts/fixtures/session-start.json
node my-custom-hook-scripts/cost-warn.js < my-custom-hook-scripts/fixtures/session-start.json
rm ~/.argus/cost-warn.json
```

Expected: first invocation emits `{"systemMessage":"⚠ Token usage high: ..."}`; second emits the plain-text message (Codex path). The `rm` restores default config.

- [ ] **Step 6: Verify fail-open with missing database**

Run:

```bash
HOME=/tmp/argus-nonexistent CLAUDECODE=1 node my-custom-hook-scripts/cost-warn.js < my-custom-hook-scripts/fixtures/session-start.json; echo "exit=$?"
```

Expected: no output, `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add my-custom-hook-scripts/cost-warn.js my-custom-hook-scripts/fixtures/session-start.json
git commit -m "feat: add argus-powered cost warning hook script"
```

---

### Task 4: `README.md` — wiring and testing docs

**Files:**
- Create: `my-custom-hook-scripts/README.md`

- [ ] **Step 1: Write the README**

`my-custom-hook-scripts/README.md`:

````markdown
# my-custom-hook-scripts

Standalone hook scripts for Claude Code and Codex. Zero dependencies — each file
is self-contained and can be copied anywhere. All scripts fail open: any internal
error exits 0 silently so a hook bug never blocks the agent. Scripts log to
`~/.argus/hook-scripts.log`.

Agent detection: `CLAUDECODE=1` env var → Claude Code (JSON hook output);
otherwise Codex (plain text / exit codes).

## Scripts

| Script | Hook event | Purpose |
| --- | --- | --- |
| `block-dangerous.js` | PreToolUse (`Bash`) | Deny dangerous shell commands (`rm -rf ~`, `curl \| sh`, force-push to main, `mkfs`, ...) with a reason the agent can act on. |
| `protect-secrets.js` | PreToolUse (`Read\|Edit\|Write\|Bash`) | Deny access to secret files (`.env`, `*.pem`, `~/.ssh/`, `~/.aws/`, ...). `.env.example/sample/template` are allowed. |
| `cost-warn.js` | SessionStart | Warn when token usage in the rolling 5h window (from the local argus DB) crosses a threshold. Silent otherwise. |
| `permission-request.js` | PermissionRequest | Native macOS approval dialog with an "Always" list. |
| `stop.js` | Stop | Local notification when the agent finishes. |
| `argus-activate-local.js` | SessionStart | Argus liveness banner with event/session counts. |

## Claude Code wiring (`~/.claude/settings.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node /Users/duytran/GitHub/argus/my-custom-hook-scripts/block-dangerous.js" }]
      },
      {
        "matcher": "Read|Edit|Write|Bash",
        "hooks": [{ "type": "command", "command": "node /Users/duytran/GitHub/argus/my-custom-hook-scripts/protect-secrets.js" }]
      }
    ],
    "SessionStart": [
      {
        "hooks": [{ "type": "command", "command": "node /Users/duytran/GitHub/argus/my-custom-hook-scripts/cost-warn.js" }]
      }
    ]
  }
}
```

## Configuration (all optional, in `~/.argus/`)

| File | Shape | Used by |
| --- | --- | --- |
| `dangerous-patterns.json` | `{ "extra": ["<regex>"], "allow": ["<regex>"] }` | `block-dangerous.js` |
| `protected-paths.json` | `{ "extra": ["<regex>"], "allow": ["<regex>"] }` | `protect-secrets.js` |
| `cost-warn.json` | `{ "threshold_tokens": 5000000, "warn_pct": 80 }` | `cost-warn.js` |

`allow` lists are checked before deny patterns — first match wins.

## Testing

Pipe a fixture into a script and check the output:

```bash
CLAUDECODE=1 node block-dangerous.js < fixtures/bash-dangerous.json   # deny JSON
CLAUDECODE=1 node block-dangerous.js < fixtures/bash-safe.json        # {}
CLAUDECODE=1 node protect-secrets.js < fixtures/read-env.json         # deny JSON
CLAUDECODE=1 node protect-secrets.js < fixtures/read-env-example.json # {}
CLAUDECODE=1 node cost-warn.js < fixtures/session-start.json          # silent unless over threshold
```

Codex behavior: drop `CLAUDECODE=1` — blockers exit 2 with the reason on stderr;
`cost-warn.js` prints plain text instead of JSON.

## Known limitations

- `cost-warn.js` approximates the Claude billing window with a rolling 5-hour
  lookback over session activity (`last_seen_at`); it does not track exact
  billing-block boundaries.
- Blockers are regex-based: they stop common accidents, not a determined
  adversary. Shell obfuscation can evade them.
````

- [ ] **Step 2: Verify all fixture tests still pass (full sweep)**

Run:

```bash
cd my-custom-hook-scripts
CLAUDECODE=1 node block-dangerous.js < fixtures/bash-dangerous.json | grep -c deny
CLAUDECODE=1 node block-dangerous.js < fixtures/bash-safe.json
CLAUDECODE=1 node protect-secrets.js < fixtures/read-env.json | grep -c deny
CLAUDECODE=1 node protect-secrets.js < fixtures/read-env-example.json
CLAUDECODE=1 node protect-secrets.js < fixtures/read-safe.json
CLAUDECODE=1 node protect-secrets.js < fixtures/bash-cat-env.json | grep -c deny
CLAUDECODE=1 node cost-warn.js < fixtures/session-start.json; echo "cost-warn exit=$?"
```

Expected: `1` / `{}` / `1` / `{}` / `{}` / `1` / `cost-warn exit=0`.

- [ ] **Step 3: Commit**

```bash
git add my-custom-hook-scripts/README.md
git commit -m "docs: add README for hook script collection"
```

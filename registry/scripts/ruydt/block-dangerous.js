#!/usr/bin/env node
// @argus-meta
// title: Block dangerous commands
// author: ruydt
// events: PreToolUse
// agents: claudecode, codex
// command: node ~/.argus/hooks/block-dangerous.js
// matcher: Bash
// purpose: Deny dangerous shell commands (rm -rf ~, curl | sh, force-push to main, mkfs) with a reason the agent can act on.
// os: linux, macos, windows
// @end

// PreToolUse hook (matcher: Bash): blocks dangerous shell commands for Claude Code and Codex.
// Deny + reason so the agent can self-correct. Fail-open: any script error exits 0 silently.
// Config (optional): ~/.argus/dangerous-patterns.json { "extra": ["<regex>"], "allow": ["<regex>"] }

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'dangerous-patterns.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
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
    re: /\bgit\s+push\b[^|;&]*(--force(?!-with-lease)\b|\s-f\b)[^|;&]*\b(main|master)\b|\bgit\s+push\b[^|;&]*\b(main|master)\b[^|;&]*(--force(?!-with-lease)\b|\s-f\b)/,
    why: 'force push to main/master',
  },
  { re: /\bDROP\s+(DATABASE|TABLE)\b/i, why: 'SQL DROP statement' },
  { re: /\bdd\b[^|;&]*\bof=\/dev\/(sd|hd|disk|nvme)/, why: 'dd writing to a raw device' },
  { re: /\bmkfs(\.\w+)?\b/, why: 'filesystem format command' },
  { re: />\s*\/dev\/(sd|hd|disk|nvme)\w*/, why: 'redirect to a raw device' },
];

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} block-dangerous.js ${level} ${msg}\n`);
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
    const obj = parsed && typeof parsed === 'object' ? parsed : {};
    logSession = typeof obj.session_id === 'string' && obj.session_id ? obj.session_id.slice(0, 8) : '-';
    return obj;
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

#!/usr/bin/env node
// @argus-meta
// title: Inject context
// author: ruydt
// events: UserPromptSubmit
// agents: claudecode, codex
// command: node ~/.argus/hooks/inject-context.js
// purpose: Inject just-in-time context per prompt: git branch + working-tree state, plus .argus-context.md or ~/.argus/context.md if present.
// os: linux, macos, windows
// @end

// UserPromptSubmit hook: injects just-in-time context with every prompt — current git
// branch + working-tree state, plus an optional project context file. Cheap (two git
// calls, hard timeouts) because UserPromptSubmit runs on EVERY prompt and its hook
// timeout is 30s, not the usual 600s. Silent when there is nothing to say.
// Fail-open: any error exits 0 with no output.
//
// Context file lookup (first hit wins, capped at 4 KB):
//   <cwd>/.argus-context.md   — per-project notes the agent should always see
//   ~/.argus/context.md       — global notes
// Config (optional): ~/.argus/inject-context.json
//   { "git": true, "context_file": true, "max_file_bytes": 4096 }

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'inject-context.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
const isClaudeCode = process.env.CLAUDECODE === '1';

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} inject-context.js ${level} ${msg}\n`);
  } catch (_) {}
}

function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
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

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      git: parsed.git !== false,
      context_file: parsed.context_file !== false,
      max_file_bytes:
        Number.isFinite(parsed.max_file_bytes) && parsed.max_file_bytes > 0
          ? parsed.max_file_bytes
          : 4096,
    };
  } catch (_) {
    return { git: true, context_file: true, max_file_bytes: 4096 };
  }
}

// NOTE: porcelain status codes are positional — a leading space is meaningful
// (" M" = modified unstaged). Never trim() the whole output, only split lines.
function git(args, cwd) {
  return execSync(`git ${args}`, {
    cwd,
    encoding: 'utf8',
    timeout: 1500,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function gitLine(cwd) {
  try {
    const branch = git('branch --show-current', cwd).trim() || '(detached HEAD)';
    const status = git('status --porcelain', cwd);
    if (!status.trim()) return `git: on ${branch}, working tree clean`;
    const lines = status.split('\n').filter(l => l.length >= 2);
    const staged = lines.filter(l => l[0] !== ' ' && l[0] !== '?').length;
    const unstaged = lines.filter(l => l[1] !== ' ' && l[0] !== '?').length;
    const untracked = lines.filter(l => l.startsWith('??')).length;
    const parts = [];
    if (staged) parts.push(`${staged} staged`);
    if (unstaged) parts.push(`${unstaged} modified`);
    if (untracked) parts.push(`${untracked} untracked`);
    return `git: on ${branch}, ${parts.join(', ')}`;
  } catch (_) {
    return ''; // not a repo / git missing
  }
}

function contextFile(cwd, maxBytes) {
  const candidates = [path.join(cwd, '.argus-context.md'), path.join(os.homedir(), '.argus', 'context.md')];
  for (const file of candidates) {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) continue;
      const content = fs.readFileSync(file, 'utf8').slice(0, maxBytes).trim();
      if (content) return content;
    } catch (_) {}
  }
  return '';
}

async function main() {
  const payload = parsePayload(await readStdin());
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const config = readConfig();

  const parts = [];
  if (config.git) {
    const line = gitLine(cwd);
    if (line) parts.push(line);
  }
  if (config.context_file) {
    const content = contextFile(cwd, config.max_file_bytes);
    if (content) parts.push(content);
  }

  if (parts.length === 0) return;
  const context = parts.join('\n\n');
  logScript('INFO', `injected ${context.length} chars`);

  if (isClaudeCode) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context },
      }) + '\n'
    );
    return;
  }
  process.stdout.write(context + '\n');
}

main()
  .catch(() => {
    logScript('ERROR', 'failed');
  })
  .finally(() => {
    process.exit(0);
  });

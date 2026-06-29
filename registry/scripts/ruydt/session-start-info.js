#!/usr/bin/env node
// @argus-meta
// title: Session start project info
// author: ruydt
// events: SessionStart
// agents: claudecode, codex
// command: node ~/.argus/hooks/session-start-info.js
// purpose: Inject detected toolchain (package manager, language) + git branch as context once at session start.
// os: linux, macos, windows
// @end

// SessionStart hook: gives the agent a quick orientation line at the start of a session —
// detected package manager / language toolchain and the current git branch + tree state —
// so it doesn't guess `npm` vs `pnpm` or which branch it's on. Ported/simplified from the
// ECC "Session start" hook (the plugin's memory/context-restore parts are intentionally
// left out; this is pure, cheap, stateless detection). Silent when there's nothing useful.
// Fail-open: any error exits 0 with no output.
//
// Config (optional): ~/.argus/session-start-info.json
//   { "git": true, "toolchain": true }

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'session-start-info.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
const isClaudeCode = process.env.CLAUDECODE === '1';

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} session-start-info.js ${level} ${msg}\n`);
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
    return { git: parsed.git !== false, toolchain: parsed.toolchain !== false };
  } catch (_) {
    return { git: true, toolchain: true };
  }
}

function has(cwd, file) {
  try {
    return fs.existsSync(path.join(cwd, file));
  } catch (_) {
    return false;
  }
}

function toolchainLine(cwd) {
  const found = [];
  if (has(cwd, 'package.json')) {
    let pm = 'npm';
    if (has(cwd, 'pnpm-lock.yaml')) pm = 'pnpm';
    else if (has(cwd, 'yarn.lock')) pm = 'yarn';
    else if (has(cwd, 'bun.lockb')) pm = 'bun';
    found.push(`node (${pm})`);
  }
  if (has(cwd, 'go.mod')) found.push('go');
  if (has(cwd, 'Cargo.toml')) found.push('rust (cargo)');
  if (has(cwd, 'pyproject.toml') || has(cwd, 'requirements.txt') || has(cwd, 'setup.py')) {
    let py = 'python';
    if (has(cwd, 'poetry.lock')) py = 'python (poetry)';
    else if (has(cwd, 'uv.lock')) py = 'python (uv)';
    else if (has(cwd, 'Pipfile')) py = 'python (pipenv)';
    found.push(py);
  }
  if (has(cwd, 'Gemfile')) found.push('ruby (bundler)');
  if (has(cwd, 'pom.xml')) found.push('java (maven)');
  if (has(cwd, 'build.gradle') || has(cwd, 'build.gradle.kts')) found.push('java/kotlin (gradle)');
  if (found.length === 0) return '';
  return `toolchain: ${found.join(', ')}`;
}

function gitLine(cwd) {
  try {
    const branch = execSync('git branch --show-current', {
      cwd,
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const status = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const dirty = status.split('\n').filter(l => l.trim().length > 0).length;
    const head = branch || '(detached HEAD)';
    return dirty ? `git: on ${head}, ${dirty} uncommitted change(s)` : `git: on ${head}, clean`;
  } catch (_) {
    return '';
  }
}

async function main() {
  const payload = parsePayload(await readStdin());
  const config = readConfig();
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

  const parts = [];
  if (config.toolchain) {
    const line = toolchainLine(cwd);
    if (line) parts.push(line);
  }
  if (config.git) {
    const line = gitLine(cwd);
    if (line) parts.push(line);
  }
  if (parts.length === 0) return;

  const context = parts.join('\n');
  logScript('INFO', `injected ${context.length} chars`);

  if (isClaudeCode) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
        systemMessage: context,
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

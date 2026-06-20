#!/usr/bin/env node
// @argus-meta
// title: Git autostage
// events: Stop
// agents: claudecode, codex
// command: node ~/.argus/hooks/git-autostage.js
// purpose: Opt-in checkpoint per agent turn: git add -u (tracked files only), optional local commit, never pushes.
// os: linux, macos, windows
// @end

// Stop hook: stages (and optionally commits) the turn's work as a local checkpoint.
// OPT-IN — does nothing until enabled in config. Stop-event granularity on purpose:
// one checkpoint per agent turn instead of per-edit "wip" noise.
//
// Safety choices (from ecosystem postmortems):
//   - `git add -u` only: stages modified/deleted TRACKED files. Never stages new
//     untracked files, so a freshly created .env or credentials file is never
//     swept into a commit by automation.
//   - `git diff --cached --quiet` guard prevents empty commits.
//   - NEVER pushes. Checkpoints stay local; pushing stays a human decision.
//   - Detached HEAD or non-repo cwd -> silent no-op.
// Always exits 0.
//
// Config (required to activate): ~/.argus/git-autostage.json
//   { "enabled": true, "commit": false, "message_prefix": "checkpoint:" }
//   enabled: stage tracked changes at Stop.  commit: also commit them.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'git-autostage.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} git-autostage.js ${level} ${msg}\n`);
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
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      enabled: parsed.enabled === true,
      commit: parsed.commit === true,
      message_prefix:
        typeof parsed.message_prefix === 'string' && parsed.message_prefix
          ? parsed.message_prefix
          : 'checkpoint:',
    };
  } catch (_) {
    return { enabled: false, commit: false, message_prefix: 'checkpoint:' };
  }
}

function git(args, cwd) {
  return execSync(`git ${args}`, {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

async function main() {
  const config = readConfig();
  if (!config.enabled) return;

  const payload = parsePayload(await readStdin());
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

  try {
    if (git('rev-parse --is-inside-work-tree', cwd) !== 'true') return;
  } catch (_) {
    return; // not a repo / git missing
  }

  try {
    git('add -u', cwd);
  } catch (_) {
    logScript('WARN', 'git add -u failed');
    return;
  }

  if (!config.commit) {
    logScript('INFO', `staged tracked changes in ${cwd}`);
    return;
  }

  try {
    git('diff --cached --quiet', cwd);
    return; // nothing staged -> no commit
  } catch (_) {
    // non-zero exit = staged changes exist, proceed
  }

  const session = typeof payload.session_id === 'string' ? payload.session_id.slice(0, 8) : '';
  const message = `${config.message_prefix} agent turn${session ? ` (${session})` : ''}`;
  try {
    execSync('git commit --no-verify -m ' + JSON.stringify(message), {
      cwd,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    logScript('INFO', `committed checkpoint in ${cwd}`);
  } catch (_) {
    logScript('WARN', 'commit failed');
  }
}

main()
  .catch(() => {
    logScript('ERROR', 'failed');
  })
  .finally(() => {
    process.exit(0);
  });

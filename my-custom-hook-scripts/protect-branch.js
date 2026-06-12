#!/usr/bin/env node
// PreToolUse hook (matcher: Bash): blocks git commit/push/destructive ops on protected
// branches and suggests a feature branch instead. Resolves the CURRENT branch by shelling
// out to git in the hook payload's cwd — worktree-safe (`git branch --show-current` is
// per-worktree; reading .git/HEAD directly breaks where .git is a file) and quiet on
// detached HEAD (empty output -> pass). Fail-open: any script error exits 0.
//
// This is a safety net for honest mistakes, not a security boundary — chained commands
// (`cd x && git push`), aliases, and `git -C` can bypass the regexes.
//
// Blocked on a protected branch: git commit (incl. --amend unless allow_amend),
// any git push that targets a protected branch (explicit refspec or implicit current
// branch), git branch -D <protected>, git push --delete <protected>.
// Config (optional): ~/.argus/protected-branches.json
//   { "branches": ["main", "master"], "allow_amend": false, "allow": ["<regex>"] }

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'protected-branches.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const isClaudeCode = process.env.CLAUDECODE === '1';

const DEFAULTS = { branches: ['main', 'master'], allow_amend: false, allow: [] };

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} protect-branch.js ${level} ${msg}\n`);
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

function toRegexList(values) {
  const out = [];
  if (!Array.isArray(values)) return out;
  for (const value of values) {
    if (typeof value !== 'string' || !value) continue;
    try {
      out.push(new RegExp(value));
    } catch (_) {
      logScript('WARN', `invalid config regex skipped: ${value.slice(0, 80)}`);
    }
  }
  return out;
}

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      branches:
        Array.isArray(parsed.branches) && parsed.branches.length > 0
          ? parsed.branches.filter(b => typeof b === 'string' && b)
          : DEFAULTS.branches,
      allow_amend: parsed.allow_amend === true,
      allow: toRegexList(parsed.allow),
    };
  } catch (_) {
    return { ...DEFAULTS, allow: [] };
  }
}

function ellipsis(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function currentBranch(cwd) {
  try {
    return execSync('git branch --show-current', {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return ''; // not a repo / git missing -> treat as detached, pass
  }
}

function pass() {
  process.stdout.write('{}\n');
}

function deny(reason, command) {
  logScript('WARN', `deny: ${reason} | ${ellipsis(command, 200)}`);
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
  const payload = parsePayload(await readStdin());
  const input =
    payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const command = typeof input.command === 'string' ? input.command : '';
  if (!command || !/\bgit\b/.test(command)) {
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

  const protectedSet = new Set(config.branches);
  const branchAlt = config.branches.map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  // Ops that name a protected branch directly — current branch irrelevant.
  if (new RegExp(`\\bgit\\s+branch\\b[^|;&]*\\s-D\\s+['"]?(${branchAlt})['"]?(\\s|$)`).test(command)) {
    deny(
      `Blocked: deleting a protected branch. Protected: ${config.branches.join(', ')}.`,
      command
    );
    return;
  }
  if (
    new RegExp(`\\bgit\\s+push\\b[^|;&]*(--delete|\\s-d)\\s+\\S+\\s+['"]?(${branchAlt})['"]?(\\s|$)`).test(
      command
    )
  ) {
    deny(
      `Blocked: deleting a protected branch on the remote. Protected: ${config.branches.join(', ')}.`,
      command
    );
    return;
  }

  const isCommit = /\bgit\s+commit\b/.test(command);
  const isPush = /\bgit\s+push\b/.test(command);
  if (!isCommit && !isPush) {
    pass();
    return;
  }

  // Push with an explicit refspec to a protected branch blocks regardless of cwd branch.
  if (isPush) {
    const refspec = new RegExp(
      `\\bgit\\s+push\\b[^|;&]*\\s(\\S+:)?['"]?(${branchAlt})['"]?(\\s|$)`
    );
    if (refspec.test(command)) {
      deny(
        `Blocked: pushing to a protected branch (${config.branches.join(', ')}). Push a feature branch and open a PR instead.`,
        command
      );
      return;
    }
  }

  // Implicit target: what branch is checked out where the command will run?
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const branch = currentBranch(cwd);
  if (!branch || !protectedSet.has(branch)) {
    pass();
    return;
  }

  if (isCommit) {
    const isAmend = /\s--amend\b/.test(command);
    if (isAmend && config.allow_amend) {
      pass();
      return;
    }
    deny(
      `Blocked: committing directly on protected branch "${branch}". Create a feature branch first: git checkout -b <feature-name>`,
      command
    );
    return;
  }

  // isPush with no explicit protected refspec, but current branch is protected.
  deny(
    `Blocked: pushing from protected branch "${branch}". Create a feature branch and open a PR instead.`,
    command
  );
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});

#!/usr/bin/env node
// @argus-meta
// title: Lint commit messages
// events: PreToolUse
// agents: claudecode, codex
// command: node ~/.argus/hooks/commit-msg-lint.js
// matcher: Bash
// purpose: Block git commits whose message does not follow Conventional Commits (e.g. "fix(auth): handle expired token").
// os: linux, macos, windows
// @end

// PreToolUse hook (matcher: Bash): inspects `git commit` commands and blocks when
// the inline -m message does not follow Conventional Commits. Fails OPEN — any case
// it cannot judge is allowed through: a non-commit command, a commit with no inline
// -m (editor opens), -F/--file, --amend without -m, git's default Merge/Revert
// messages, or any script error. Works for Claude Code (permissionDecision deny) and
// Codex/others (stderr + exit 2).
// Config (optional): ~/.argus/commit-lint.json
//   { "types": ["feat","fix",...], "maxSubjectLength": 0, "requireScope": false,
//     "pattern": "<regex>", "example": "<good message>" }
//   maxSubjectLength 0 = off. types/requireScope tune the built-in Conventional
//   Commits check. A non-empty "pattern" REPLACES that check with your own regex —
//   for non-conventional formats, e.g. "^\\[[A-Z]+-\\d+\\] .+" for a Jira key prefix.
//   "example" is shown in the block message so the agent knows the expected shape.
//   An invalid "pattern" is ignored (falls back to the Conventional Commits check).

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'commit-lint.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const isClaudeCode = process.env.CLAUDECODE === '1';
const logAgent = isClaudeCode ? 'claudecode' : 'codex';
let logSession = '-';

const DEFAULT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

function logScript(level, msg) {
  try {
    fs.appendFileSync(
      scriptLog,
      `${new Date().toISOString()} ${logAgent} ${logSession} commit-msg-lint.js ${level} ${msg}\n`
    );
  } catch (_) {}
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
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
    logSession =
      typeof obj.session_id === 'string' && obj.session_id ? obj.session_id.slice(0, 8) : '-';
    return obj;
  } catch (_) {
    return {};
  }
}

function ellipsis(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readConfig() {
  const config = {
    types: DEFAULT_TYPES,
    maxSubjectLength: 0,
    requireScope: false,
    pattern: null,
    example: '',
  };
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (Array.isArray(parsed.types)) {
      const types = parsed.types.filter((t) => typeof t === 'string' && t.trim());
      if (types.length) config.types = types.map((t) => t.trim());
    }
    if (Number.isFinite(parsed.maxSubjectLength) && parsed.maxSubjectLength > 0) {
      config.maxSubjectLength = Math.floor(parsed.maxSubjectLength);
    }
    if (typeof parsed.requireScope === 'boolean') config.requireScope = parsed.requireScope;
    if (typeof parsed.example === 'string') config.example = parsed.example.trim();
    if (typeof parsed.pattern === 'string' && parsed.pattern.trim()) {
      // Validate the custom regex up front; an invalid one is ignored (caught below)
      // so we fall back to the Conventional Commits check rather than throwing later.
      new RegExp(parsed.pattern);
      config.pattern = parsed.pattern;
    }
  } catch (_) {
    // missing/invalid config → keep whatever defaults/valid fields were set (fail-open)
  }
  return config;
}

// tokenize splits a shell command segment into argv-like tokens, respecting single
// and double quotes. It is deliberately simple — good enough to find -m values, not
// a full shell parser. Anything it cannot parse cleanly just fails open downstream.
function tokenize(s) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let started = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    // Inside single quotes everything is literal, including backslashes.
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
      started = true;
      continue;
    }
    // Outside single quotes a backslash escapes the next character (so `\"`
    // inside a double-quoted message does not prematurely close the quote).
    if (c === '\\' && i + 1 < s.length) {
      cur += s[i + 1];
      i++;
      started = true;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else cur += c;
      started = true;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      started = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n') {
      if (started) {
        tokens.push(cur);
        cur = '';
        started = false;
      }
      continue;
    }
    cur += c;
    started = true;
  }
  if (started) tokens.push(cur);
  return tokens;
}

// isGitCommit reports whether a single command segment is a `git commit` invocation
// (git, optional global flags, then the commit subcommand). Matches a chained
// segment like "git commit -m ..." but not "git log --grep=commit".
function isGitCommit(segment) {
  return /(^|\s)git\b(?:\s+-{1,2}[^\s]+)*\s+commit\b/.test(segment);
}

// extractCommit walks the tokens of a `git commit` segment and returns what we need
// to decide: the first inline -m subject (if any), and whether the message comes
// from a file or an amend with no -m (both un-judgeable → fail open).
function extractCommit(tokens) {
  let subject = null;
  let sawMessage = false;
  let fromFile = false;
  let amend = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--amend') {
      amend = true;
      continue;
    }
    if (t === '-F' || t === '--file') {
      fromFile = true;
      i++; // consume the file argument
      continue;
    }
    if (t.startsWith('--file=') || (t.startsWith('-F') && t.length > 2)) {
      fromFile = true;
      continue;
    }
    if (t === '--message') {
      if (!sawMessage) {
        subject = tokens[i + 1] ?? null;
        sawMessage = true;
      }
      i++; // consume the message argument
      continue;
    }
    if (t.startsWith('--message=')) {
      if (!sawMessage) {
        subject = t.slice('--message='.length);
        sawMessage = true;
      }
      continue;
    }
    // Short-flag bundle containing -m (e.g. -m, -am, -amfoo, -ma). Once m appears in
    // a short bundle, the rest of the token is its value; if nothing follows, the
    // next token is the value.
    if (/^-[A-Za-z]*m/.test(t)) {
      const idx = t.indexOf('m');
      const attached = t.slice(idx + 1);
      if (!sawMessage) {
        if (attached !== '') subject = attached;
        else subject = tokens[i + 1] ?? null;
        sawMessage = true;
      }
      if (attached === '') i++; // consumed next token as the value
      continue;
    }
  }

  return { subject, sawMessage, fromFile, amend };
}

function buildPattern(config) {
  // A custom pattern (validated in readConfig) replaces the built-in check entirely.
  if (config.pattern) return new RegExp(config.pattern);
  const types = config.types.map(escapeRegex).join('|');
  const scope = config.requireScope ? '\\([^)]+\\)' : '(?:\\([^)]+\\))?';
  return new RegExp(`^(?:${types})${scope}!?: .+`);
}

function pass() {
  process.stdout.write('{}\n');
}

function deny(reason, badSubject) {
  logScript('WARN', `deny: ${ellipsis(badSubject, 200)}`);
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
  const tool = typeof data.tool_name === 'string' ? data.tool_name.toLowerCase() : '';
  if (tool !== 'bash' && tool !== 'shell') {
    pass();
    return;
  }

  const input =
    data.tool_input && typeof data.tool_input === 'object' && !Array.isArray(data.tool_input)
      ? data.tool_input
      : {};
  const command = typeof input.command === 'string' ? input.command : '';
  if (!command) {
    pass();
    return;
  }

  // Find the segment that is a git commit (avoids reading -m from another command in
  // a chain like `git add -A && git commit -m "..."`).
  const segments = command.split(/&&|\|\||;|\n/);
  const commitSegment = segments.find(isGitCommit);
  if (!commitSegment) {
    pass();
    return;
  }

  const { subject, sawMessage, fromFile, amend } = extractCommit(tokenize(commitSegment));

  // Fail-open cases we cannot or should not judge.
  if (fromFile || !sawMessage || (amend && !sawMessage)) {
    pass();
    return;
  }
  if (typeof subject !== 'string' || subject.trim() === '') {
    pass();
    return;
  }

  const firstLine = subject.split('\n')[0].trim();
  // git's auto-generated merge/revert messages are not Conventional Commits.
  if (/^Merge /.test(firstLine) || /^Revert "/.test(firstLine)) {
    pass();
    return;
  }

  const config = readConfig();

  if (config.maxSubjectLength > 0 && firstLine.length > config.maxSubjectLength) {
    deny(
      `Commit subject is ${firstLine.length} characters (limit ${config.maxSubjectLength}). ` +
        `Shorten the subject line and retry.`,
      firstLine
    );
    return;
  }

  if (!buildPattern(config).test(firstLine)) {
    let reason;
    if (config.pattern) {
      reason =
        `Commit message "${ellipsis(firstLine, 120)}" does not match the required format` +
        (config.example ? `, e.g. "${ellipsis(config.example, 120)}"` : ` (/${config.pattern}/)`) +
        `. Rewrite the message and retry.`;
    } else {
      reason =
        `Commit message "${ellipsis(firstLine, 120)}" does not follow Conventional Commits. ` +
        `Use "<type>(<scope>): <description>", e.g. "fix(auth): handle expired token". ` +
        `Allowed types: ${config.types.join(', ')}` +
        (config.requireScope ? ' (a scope is required).' : '.') +
        ` Rewrite the message and retry.`;
    }
    deny(reason, firstLine);
    return;
  }

  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});

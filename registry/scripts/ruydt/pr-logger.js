#!/usr/bin/env node
// @argus-meta
// title: PR logger
// author: ruydt
// events: PostToolUse
// agents: claudecode, codex
// command: node ~/.argus/hooks/pr-logger.js
// matcher: Bash
// purpose: After `gh pr create`, capture the PR URL to ~/.argus/pr-log.txt and print a review hint.
// os: linux, macos, windows
// @end

// PostToolUse hook (matcher: Bash): when the command was `gh pr create`, pull the PR URL
// out of the tool output, append it to ~/.argus/pr-log.txt with a timestamp, and surface a
// `gh pr view <n> --web` hint on stderr (shown in the argus simulator / transcript). Purely
// observational — never blocks. Ported from the ECC "PR logger" hook. Fail-open: exits 0.
//
// Handles several output shapes: tool_response (string | {stdout}), tool_output.output,
// tool_output (string).

const fs = require('fs');
const os = require('os');
const path = require('path');

const PR_LOG = path.join(os.homedir(), '.argus', 'pr-log.txt');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} pr-logger.js ${level} ${msg}\n`);
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

// Flatten the various PostToolUse output shapes into one searchable string.
function outputText(payload) {
  const parts = [];
  const push = v => {
    if (typeof v === 'string') parts.push(v);
    else if (v && typeof v === 'object') {
      if (typeof v.stdout === 'string') parts.push(v.stdout);
      if (typeof v.output === 'string') parts.push(v.output);
      if (typeof v.stderr === 'string') parts.push(v.stderr);
    }
  };
  push(payload.tool_response);
  push(payload.tool_output);
  return parts.join('\n');
}

function pass() {
  process.stdout.write('{}\n');
}

async function main() {
  const payload = parsePayload(await readStdin());
  const input =
    payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const command = typeof input.command === 'string' ? input.command : '';
  if (!command || !/\bgh\s+pr\s+create\b/.test(command)) {
    pass();
    return;
  }

  const text = outputText(payload);
  const match = text.match(/https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/(\d+)/);
  if (!match) {
    pass();
    return;
  }

  const url = match[0];
  const number = match[1];
  try {
    fs.appendFileSync(PR_LOG, `${new Date().toISOString()} ${logSession} ${url}\n`);
  } catch (_) {}
  logScript('INFO', `pr created ${url}`);
  process.stderr.write(`[pr-logger] PR #${number} created: ${url}\n  review: gh pr view ${number} --web\n`);
  pass();
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});

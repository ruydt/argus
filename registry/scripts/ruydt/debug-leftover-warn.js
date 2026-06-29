#!/usr/bin/env node
// @argus-meta
// title: Debug-leftover warning
// author: ruydt
// events: PostToolUse
// agents: claudecode, codex
// command: node ~/.argus/hooks/debug-leftover-warn.js
// matcher: Edit|Write|MultiEdit
// purpose: Flag debug statements (console.log, debugger, pdb, dbg!, print) introduced by the edit so the agent removes them.
// os: linux, macos, windows
// @end

// PostToolUse hook (matcher: Edit|Write|MultiEdit): scans ONLY the text the edit added
// (tool_input.new_string / content / MultiEdit edits[]) for debug statements and feeds a
// note back so the agent strips them. Scoped to added text, so pre-existing debug code
// elsewhere in the file won't trip it. Ported from the ECC "console.log warning" hook,
// widened to other languages. PostToolUse cannot undo the edit, so the message is returned
// as {"decision":"block","reason":...} (Claude) / stderr (Codex) for next-turn cleanup.
// Fail-open: any script error exits 0.
//
// Config (optional): ~/.argus/debug-leftover-warn.json
//   { "skip_ext": [".test.ts"], "extra": ["<regex>"] }

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILE = path.join(os.homedir(), '.argus', 'debug-leftover-warn.json');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const logAgent = process.env.CLAUDECODE === '1' ? 'claudecode' : 'codex';
let logSession = '-';
const isClaudeCode = process.env.CLAUDECODE === '1';

const DEBUG_PATTERNS = [
  { re: /\bconsole\.(log|debug|dir|trace)\s*\(/, why: 'console.log/debug' },
  { re: /\bdebugger\b\s*;?/, why: 'debugger' },
  { re: /\bbreakpoint\s*\(\s*\)/, why: 'breakpoint()' },
  { re: /\bpdb\.set_trace\s*\(/, why: 'pdb.set_trace()' },
  { re: /^\s*import\s+i?pdb\b/m, why: 'import pdb' },
  { re: /\bbinding\.pry\b/, why: 'binding.pry' },
  { re: /\bdbg!\s*\(/, why: 'dbg! macro' },
  { re: /\bvar_dump\s*\(/, why: 'var_dump()' },
];

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, `${new Date().toISOString()} ${logAgent} ${logSession} debug-leftover-warn.js ${level} ${msg}\n`);
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
      skip_ext: Array.isArray(parsed.skip_ext) ? parsed.skip_ext.map(s => String(s).toLowerCase()) : [],
      extra: toRegexList(parsed.extra).map(re => ({ re, why: 'custom pattern' })),
    };
  } catch (_) {
    return { skip_ext: [], extra: [] };
  }
}

// Collect the text this tool call introduced, across Edit / Write / MultiEdit shapes.
function addedText(input) {
  const parts = [];
  if (typeof input.new_string === 'string') parts.push(input.new_string);
  if (typeof input.content === 'string') parts.push(input.content);
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) {
      if (e && typeof e.new_string === 'string') parts.push(e.new_string);
    }
  }
  return parts.join('\n');
}

function pass() {
  process.stdout.write('{}\n');
}

function feedback(text) {
  logScript('WARN', text.replace(/\s+/g, ' ').slice(0, 160));
  if (isClaudeCode) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: text }) + '\n');
    return;
  }
  process.stderr.write(text + '\n');
}

async function main() {
  const payload = parsePayload(await readStdin());
  const input =
    payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  const config = readConfig();

  const lower = filePath.toLowerCase();
  if (config.skip_ext.some(suffix => lower.endsWith(suffix))) {
    pass();
    return;
  }

  const text = addedText(input);
  if (!text) {
    pass();
    return;
  }

  const patterns = DEBUG_PATTERNS.concat(config.extra);
  const hits = [];
  for (const line of text.split('\n')) {
    for (const pat of patterns) {
      if (pat.re.test(line)) {
        hits.push(`${pat.why} → ${line.trim().slice(0, 100)}`);
        break;
      }
    }
    if (hits.length >= 10) break;
  }

  if (hits.length === 0) {
    pass();
    return;
  }

  const where = filePath ? ` in ${path.basename(filePath)}` : '';
  feedback(
    `Your edit${where} introduced ${hits.length} debug statement(s):\n` +
      hits.map(h => `  - ${h}`).join('\n') +
      `\nRemove them before moving on (or add a skip rule to ~/.argus/debug-leftover-warn.json).`
  );
}

main().catch(() => {
  logScript('ERROR', 'script failure, failing open');
  process.stdout.write('{}\n');
});

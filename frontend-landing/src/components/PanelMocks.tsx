export function EventsFeedPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">events — live feed</span>
      </div>
      <div className="terminal-body">
        <div>
          <span className="t-dim">12:34:01</span> <span className="t-accent">▸</span>{' '}
          <span className="t-cmd">PreToolUse</span> <span className="t-sub">Bash</span>
        </div>
        <div className="t-dim" style={{ paddingLeft: '12px' }}>
          {' '}
          cmd: npm run test
        </div>
        <div>
          <span className="t-dim">12:34:02</span> <span className="t-accent">▸</span>{' '}
          <span className="t-cmd">PostToolUse</span> <span className="t-sub">Bash</span>
        </div>
        <div className="t-dim" style={{ paddingLeft: '12px' }}>
          {' '}
          exit: 0 duration: 1.2s
        </div>
        <div>
          <span className="t-dim">12:34:03</span> <span className="t-accent">▸</span>{' '}
          <span className="t-cmd">PostToolUse</span> <span className="t-sub">Write</span>{' '}
          <span className="t-path">src/App.tsx</span>
        </div>
        <div>
          <span className="t-dim">12:34:05</span> <span className="t-accent">▸</span>{' '}
          <span className="t-cmd">PostToolUse</span> <span className="t-sub">Edit</span>{' '}
          <span className="t-path">src/index.css</span>
        </div>
        <div>
          <span className="t-dim">12:34:09</span> <span className="t-ok">✓</span>{' '}
          <span className="t-cmd">Stop</span> <span className="t-dim">agent finished</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-dim">$</span> <span className="terminal-cursor" />
        </div>
      </div>
    </div>
  )
}

export function SessionsPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">sessions — waterfall</span>
      </div>
      <div className="terminal-body">
        <div>
          <span className="t-path">~/projects/argus</span> <span className="t-ok">● running</span>
        </div>
        <div className="t-dim" style={{ paddingLeft: '4px' }}>
          ├─ <span className="t-cmd">Bash</span>{' '}
          <span style={{ color: 'var(--accent)' }}>████████</span>
          <span className="t-dim">░░░░</span> 800ms
        </div>
        <div className="t-dim" style={{ paddingLeft: '4px' }}>
          ├─ <span className="t-cmd">Read</span> <span style={{ color: 'var(--accent)' }}>███</span>
          <span className="t-dim">░░░░░░░</span> 300ms
        </div>
        <div className="t-dim" style={{ paddingLeft: '4px' }}>
          ├─ <span className="t-cmd">Edit</span>{' '}
          <span style={{ color: 'var(--accent)' }}>████</span>
          <span className="t-dim">░░░░░░</span> 400ms
        </div>
        <div className="t-dim" style={{ paddingLeft: '4px' }}>
          └─ <span className="t-cmd">Write</span> <span style={{ color: 'var(--accent)' }}>██</span>
          <span className="t-dim">░░░░░░░░</span> 200ms
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-path">~/projects/api</span> <span className="t-dim">● 2m ago</span>
        </div>
        <div className="t-dim" style={{ paddingLeft: '4px' }}>
          └─ <span className="t-dim">14 tool calls · 12.4k tokens</span>
        </div>
      </div>
    </div>
  )
}

export function DashboardPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">dashboard — stats</span>
      </div>
      <div className="terminal-body">
        <div>
          <span className="t-dim">today</span>
        </div>
        <div>
          <span className="t-cmd">input tokens</span> <span className="t-accent">142,831</span>
        </div>
        <div>
          <span className="t-cmd">output tokens</span> <span className="t-accent"> 18,440</span>
        </div>
        <div>
          <span className="t-cmd">tool calls</span> <span className="t-accent"> 214</span>
        </div>
        <div>
          <span className="t-cmd">sessions</span> <span className="t-accent"> 7</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-dim">cost estimate</span>
        </div>
        <div>
          <span className="t-ok">$0.84</span> <span className="t-dim">claude-sonnet-4</span>
        </div>
        <div>
          <span className="t-ok">$0.12</span> <span className="t-dim">codex</span>
        </div>
      </div>
    </div>
  )
}

export function HooksConfigPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">hooks — config &amp; simulator</span>
      </div>
      <div className="terminal-body">
        <div>
          <span className="t-accent">▸</span> <span className="t-cmd">PreToolUse</span>{' '}
          <span className="t-ok">✓ active</span>
        </div>
        <div>
          <span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span>{' '}
          <span className="t-ok">✓ active</span>
        </div>
        <div>
          <span className="t-accent">▸</span> <span className="t-cmd">Stop</span>{' '}
          <span className="t-ok">✓ active</span>
        </div>
        <div>
          <span className="t-accent">▸</span> <span className="t-cmd">Notification</span>{' '}
          <span className="t-dim">○ inactive</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-dim">── simulate ──</span>
        </div>
        <div>
          <span className="t-sub">payload</span> <span className="t-cmd">PostToolUse/Write</span>
        </div>
        <div>
          <span className="t-ok">200</span> <span className="t-dim">event accepted · 12ms</span>
        </div>
      </div>
    </div>
  )
}

export function ProjectsPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">projects</span>
      </div>
      <div className="terminal-body">
        <div>
          <span className="t-cmd">~/work/api</span> <span className="t-ok">● running</span>
        </div>
        <div>
          <span className="t-dim">42 sessions · 1.2k events · last seen 2m ago</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-cmd">~/oss/argus</span> <span className="t-dim">○ idle</span>
        </div>
        <div>
          <span className="t-dim">17 sessions · 480 events · last seen 1h ago</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-sub">search:</span> <span className="t-cmd">api</span>
          <span className="terminal-cursor" />
        </div>
      </div>
    </div>
  )
}

export function DiagnosticsPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">diagnostics</span>
      </div>
      <div className="terminal-body">
        <div>
          <span className="t-ok">✓</span> <span className="t-cmd">backend healthy</span>{' '}
          <span className="t-path">:10804</span>
        </div>
        <div>
          <span className="t-ok">✓</span> <span className="t-cmd">db</span>{' '}
          <span className="t-path">~/.argus/argus.db · 12.4 MB</span>
        </div>
        <div>
          <span className="t-ok">✓</span> <span className="t-cmd">hooks preset</span>{' '}
          <span className="t-sub">Medium (14/30)</span>
        </div>
        <div>
          <span className="t-ok">✓</span> <span className="t-cmd">~/.argus/hooks</span>{' '}
          <span className="t-path">6 scripts</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-dim">log tail</span>
        </div>
        <div>
          <span className="t-path">hook-scripts.log · server.log · watcher.log</span>
        </div>
      </div>
    </div>
  )
}

export function ScriptsPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">my-custom-hook-scripts</span>
      </div>
      <div className="terminal-body">
        <div>
          <span className="t-path">$</span> <span className="t-cmd">ls ~/.argus/hooks</span>
        </div>
        <div>
          <span className="t-cmd">block-dangerous.js</span>{' '}
          <span className="t-cmd">protect-secrets.js</span>
        </div>
        <div>
          <span className="t-cmd">protect-branch.js</span>{' '}
          <span className="t-cmd">format-lint.js</span>
        </div>
        <div>
          <span className="t-cmd">scan-injection.js</span>{' '}
          <span className="t-cmd">notify-webhook.js</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-path">$</span>{' '}
          <span className="t-cmd">node block-dangerous.js &lt; fixtures/bash-dangerous.json</span>
        </div>
        <div>
          <span className="t-accent">▸</span> <span className="t-sub">permissionDecision:</span>{' '}
          <span className="t-cmd">deny</span>
        </div>
      </div>
    </div>
  )
}

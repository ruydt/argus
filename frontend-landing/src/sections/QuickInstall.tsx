import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { AnimateOnScroll } from '../components/AnimateOnScroll'

type Tab = 'clone' | 'hooks' | 'dashboard' | 'contribute'

type CodeBlockProps = {
  lang: string
  code: string
}

function CodeBlock({ lang, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{lang}</span>
        <button
          className={`code-copy-btn${copied ? ' copied' : ''}`}
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

const INSTALL_CODE = `# One command — downloads the binary for your OS, wires the
# Claude Code SessionStart hook, installs to ~/.argus/bin
curl -fsSL https://raw.githubusercontent.com/duytrandt04-afk/argus/main/install.sh | bash`

const HOOKS_CODE = `# Add to ~/.claude/settings.json (Claude Code)
{
  "hooks": {
    "PostToolUse": [{
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @-"
      }]
    }]
  }
}`

const DASHBOARD_CODE = `# Argus starts automatically with your next Claude Code or Codex
# session. Open the dashboard:
http://localhost:10804

# Verify the backend is live
curl -fsS http://127.0.0.1:10804/api/version`

const CONTRIBUTE_CODE = `# Build from source — needs Go 1.25+ and pnpm 10.x
git clone https://github.com/duytrandt04-afk/argus
cd argus
make build-local
~/.argus/bin/argus`

const TAB_CONTENT: Record<Tab, { label: string; lang: string; code: string }> = {
  clone: { label: 'Install', lang: 'bash', code: INSTALL_CODE },
  hooks: { label: 'Configure Hooks', lang: 'json', code: HOOKS_CODE },
  dashboard: { label: 'Open Dashboard', lang: 'bash', code: DASHBOARD_CODE },
  contribute: { label: 'Contribute', lang: 'bash', code: CONTRIBUTE_CODE },
}

export function QuickInstall() {
  const [active, setActive] = useState<Tab>('clone')
  const { lang, code } = TAB_CONTENT[active]

  return (
    <section id="install" className="quick-install">
      <div className="container">
        <AnimateOnScroll className="quick-install-header">
          <p className="section-eyebrow">03 · Install</p>
          <h2 className="section-title">Up and running in minutes</h2>
          <p>
            No accounts, no API keys, no build tools. One command installs the binary and wires your
            first hook — building from source is only for contributors.
          </p>
        </AnimateOnScroll>

        <AnimateOnScroll delay={100}>
          <div className="tabs">
            {(Object.keys(TAB_CONTENT) as Tab[]).map((key) => (
              <button
                key={key}
                className={`tab-btn${active === key ? ' active' : ''}`}
                onClick={() => setActive(key)}
              >
                {TAB_CONTENT[key].label}
              </button>
            ))}
          </div>
          <CodeBlock lang={lang} code={code} />
        </AnimateOnScroll>
      </div>
    </section>
  )
}

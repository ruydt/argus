import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { AnimateOnScroll } from '../components/AnimateOnScroll'

type Tab = 'clone' | 'hooks' | 'dashboard'

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

const CLONE_CODE = `git clone https://github.com/duytrandt04-afk/argus
cd argus
make build-local
~/.argus/bin/argus`

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

const DASHBOARD_CODE = `# Open in your browser after starting argus
http://localhost:10804

# Verify the hook endpoint is live
curl http://127.0.0.1:10804/api/hook`

const TAB_CONTENT: Record<Tab, { label: string; lang: string; code: string }> = {
  clone:     { label: 'Clone & Build',    lang: 'bash', code: CLONE_CODE },
  hooks:     { label: 'Configure Hooks',  lang: 'json', code: HOOKS_CODE },
  dashboard: { label: 'Open Dashboard',   lang: 'bash', code: DASHBOARD_CODE },
}

export function QuickInstall() {
  const [active, setActive] = useState<Tab>('clone')
  const { lang, code } = TAB_CONTENT[active]

  return (
    <section id="install" className="quick-install">
      <div className="container">
        <AnimateOnScroll className="quick-install-header">
          <h2 className="section-title">UP AND RUNNING IN MINUTES</h2>
          <p style={{ fontFamily: 'var(--font-vt)', fontSize: '19px', color: 'var(--text-muted)' }}>
            No accounts, no API keys. Clone, build, configure one hook line, and you&apos;re live.
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

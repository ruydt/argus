import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { AgentStatus } from './hooks/useAgents'

type GuidedSetupPanelProps = {
  agent: AgentStatus
}

// GuidedSetupPanel is shown for agents whose hook-config format argus cannot
// edit in-app yet. It points the user at the ingest endpoint and the agent's
// own docs so they can wire hooks toward argus manually.
export function GuidedSetupPanel({ agent }: GuidedSetupPanelProps) {
  const [copied, setCopied] = useState(false)
  const endpoint = `http://localhost:10804/api/hook?agent=${agent.id}`
  const snippet = `curl -sS -X POST '${endpoint}' \\\n  -H 'Content-Type: application/json' \\\n  --data-binary @-`

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-200">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              In-app editing isn’t available for {agent.display_name} yet
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {agent.display_name} uses a{' '}
              <code className="rounded bg-foreground/[0.06] px-1 py-0.5 text-[12px]">
                {agent.config_kind}
              </code>{' '}
              hook format argus can’t safely rewrite. Wire its hooks to argus by hand — point any
              hook command at the argus ingest endpoint:
            </p>
          </div>
          {agent.installed ? (
            <Badge className="shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-600">
              Installed
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 text-muted-foreground">
              Not detected
            </Badge>
          )}
        </div>

        <div className="relative">
          <pre className="overflow-x-auto rounded-md bg-foreground/[0.04] p-3 pr-10 text-[12px] leading-relaxed text-foreground">
            {snippet}
          </pre>
          <button
            type="button"
            onClick={copySnippet}
            className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded text-muted-foreground transition hover:bg-foreground/[0.08] hover:text-foreground"
            aria-label="Copy setup command"
            title="Copy"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>

        <div className="text-[12px] text-muted-foreground">
          Config file:{' '}
          <code className="rounded bg-foreground/[0.06] px-1 py-0.5 text-[12px] text-foreground">
            {agent.hooks_config_path}
          </code>
        </div>

        {agent.docs_url && (
          <a
            href={agent.docs_url}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-[13px] font-medium text-foreground transition-colors hover:text-foreground/80"
          >
            <ExternalLink className="size-3.5" />
            {agent.display_name} hooks documentation
          </a>
        )}
      </Card>

      {agent.events && agent.events.length > 0 && (
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-[13px] font-medium text-foreground">Supported events</p>
          <div className="flex flex-wrap gap-1.5">
            {agent.events.map((ev) => (
              <Badge
                key={ev}
                variant="outline"
                className="font-mono text-[11px] text-muted-foreground"
              >
                {ev}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

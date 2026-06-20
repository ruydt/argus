import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AgentLogo, agentMeta } from '@/agents/catalog'
import { cn } from '@/lib/utils'

import {
  type ArgusMeta,
  injectMeta,
  OS_OPTIONS,
  parseArgusMeta,
  runtimeFromExt,
} from '../community/argusMeta'

type UploadFile = { name: string; body: string }

type UploadShareFormProps = {
  files: UploadFile[]
  onSubmit: (files: UploadFile[], description: string) => void
  onCancel: () => void
}

// AgentOption is the subset of GET /api/agents the form needs: an id (for the
// header + logo) and the agent's own hook-event list (drives the event picker).
type AgentOption = { id: string; label: string; events: string[] }

// Expand the legacy aggregate os tokens (both/posix) so an edited script loads
// with concrete platform chips selected instead of an unrecognised value.
const OS_EXPAND: Record<string, string[]> = {
  both: ['linux', 'macos', 'windows'],
  posix: ['linux', 'macos'],
}

function normalizeOs(os?: string): string {
  const seen = new Set<string>()
  for (const tok of (os ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)) {
    for (const p of OS_EXPAND[tok] ?? [tok]) seen.add(p)
  }
  return OS_OPTIONS.map((o) => o.value)
    .filter((p) => seen.has(p))
    .join(', ')
}

function initialMeta(f: UploadFile): ArgusMeta {
  const parsed = parseArgusMeta(f.body)
  return {
    title: parsed.title ?? '',
    events: parsed.events ?? [],
    agents: parsed.agents ?? [],
    command: parsed.command ?? `${runtimeFromExt(f.name)} ${f.name}`,
    matcher: parsed.matcher ?? '',
    purpose: parsed.purpose ?? '',
    os: normalizeOs(parsed.os),
  }
}

const META_START = '// @argus-meta'
const META_END = '// @end'

function extractMetaBlock(body: string): string | null {
  const si = body.indexOf(META_START)
  const ei = body.indexOf(META_END)
  if (si === -1 || ei === -1) return null
  return body.slice(si, ei + META_END.length)
}

// useAgentOptions loads the agent registry once so the form can offer agents to
// target and, per selected agent, the events it supports.
function useAgentOptions(): AgentOption[] {
  const [agents, setAgents] = useState<AgentOption[]>([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/agents')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; display_name?: string; events?: string[] }[]) => {
        if (cancelled || !Array.isArray(data)) return
        setAgents(
          data.map((a) => ({
            id: a.id,
            label: a.display_name || agentMeta(a.id).label,
            events: a.events ?? [],
          }))
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return agents
}

export function UploadShareForm({ files, onSubmit, onCancel }: UploadShareFormProps) {
  const [step, setStep] = useState(0)
  const [meta, setMeta] = useState<ArgusMeta[]>(() => files.map(initialMeta))
  const [description, setDescription] = useState('')
  const agentOptions = useAgentOptions()

  const isDescriptionStep = step >= files.length
  const current = meta[step]

  function setField(field: 'title' | 'command' | 'matcher' | 'purpose', value: string) {
    setMeta((prev) => prev.map((m, i) => (i === step ? { ...m, [field]: value } : m)))
  }

  // toggleList flips one value in a list field (agents/events), keeping order.
  function toggleList(field: 'agents' | 'events', value: string) {
    setMeta((prev) =>
      prev.map((m, i) => {
        if (i !== step) return m
        const list = m[field]
        const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
        return { ...m, [field]: next }
      })
    )
  }

  // os is a comma-separated platform list; toggleOS flips one platform, keeping
  // the canonical Linux → macOS → Windows order.
  function toggleOS(value: string) {
    setMeta((prev) =>
      prev.map((m, i) => {
        if (i !== step) return m
        const current = (m.os ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value]
        const ordered = OS_OPTIONS.map((o) => o.value).filter((p) => next.includes(p))
        return { ...m, os: ordered.join(', ') }
      })
    )
  }

  // Events offered = union of every selected agent's events (deduped, ordered by
  // the agent registry). Empty until at least one agent is picked.
  const eventOptions = useMemo(() => {
    if (!current) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const a of agentOptions) {
      if (!current.agents.includes(a.id)) continue
      for (const ev of a.events) {
        if (!seen.has(ev)) {
          seen.add(ev)
          out.push(ev)
        }
      }
    }
    return out
  }, [agentOptions, current])

  const requiredFilled =
    !!current &&
    !!current.title &&
    current.agents.length > 0 &&
    current.events.length > 0 &&
    !!current.command

  function share() {
    // Drop any events that no longer belong to the selected agents before writing.
    const cleaned = meta.map((m) => ({
      ...m,
      events: m.events.filter((e) => unionEventsFor(agentOptions, m.agents).includes(e)),
    }))
    const out = files.map((f, i) => ({ name: f.name, body: injectMeta(f.body, cleaned[i]) }))

    const headerSections = out
      .map((f) => {
        const block = extractMetaBlock(f.body)
        return block ? `### ${f.name}\n\`\`\`\n${block}\n\`\`\`` : null
      })
      .filter((h): h is string => h !== null)
      .join('\n\n')

    const fullDescription = headerSections
      ? `${description ? description + '\n\n' : ''}---\n## Scripts\n\n${headerSections}`
      : description

    onSubmit(out, fullDescription)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg border border-foreground/15 bg-card">
        <DialogHeader>
          <DialogTitle>
            {isDescriptionStep
              ? 'Pull request description'
              : `File ${step + 1} of ${files.length} — ${files[step].name}`}
          </DialogTitle>
        </DialogHeader>

        {isDescriptionStep ? (
          <div className="space-y-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what these scripts do (optional)…"
              aria-label="Pull request description"
              className="h-32 w-full rounded-md border border-foreground/10 bg-background p-3 text-sm text-foreground"
            />
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep(files.length - 1)}>
                Back
              </Button>
              <Button size="sm" onClick={share}>
                Share
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-muted-foreground">Title *</span>
              <Input
                value={current.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Short human title"
                aria-label="Title"
              />
            </label>

            <div className="block space-y-1.5">
              <span className="text-[0.72rem] text-muted-foreground">Agents *</span>
              <div className="flex flex-wrap gap-1.5">
                {agentOptions.map((a) => {
                  const active = current.agents.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleList('agents', a.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.74rem] transition-colors',
                        active
                          ? 'border-foreground/30 bg-foreground/[0.06] text-foreground'
                          : 'border-foreground/10 text-muted-foreground hover:bg-foreground/[0.03]'
                      )}
                    >
                      <AgentLogo id={a.id} size={14} />
                      {a.label}
                    </button>
                  )
                })}
                {agentOptions.length === 0 ? (
                  <span className="text-[0.72rem] text-muted-foreground">Loading agents…</span>
                ) : null}
              </div>
            </div>

            <div className="block space-y-1.5">
              <span className="text-[0.72rem] text-muted-foreground">Events *</span>
              {current.agents.length === 0 ? (
                <p className="text-[0.72rem] text-muted-foreground">Select an agent first.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {eventOptions.map((ev) => {
                    const active = current.events.includes(ev)
                    return (
                      <button
                        key={ev}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleList('events', ev)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[0.74rem] transition-colors',
                          active
                            ? 'border-foreground/30 bg-foreground/[0.06] text-foreground'
                            : 'border-foreground/10 text-muted-foreground hover:bg-foreground/[0.03]'
                        )}
                      >
                        {ev}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <label className="block space-y-1">
              <span className="text-[0.72rem] text-muted-foreground">Command *</span>
              <Input
                value={current.command}
                onChange={(e) => setField('command', e.target.value)}
                placeholder="e.g. node hook.js --config ~/.argus/config.json"
                aria-label="Command"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-muted-foreground">Matcher (optional)</span>
              <Input
                value={current.matcher}
                onChange={(e) => setField('matcher', e.target.value)}
                placeholder="e.g. Bash"
                aria-label="Matcher"
              />
            </label>
            <div className="block space-y-1.5">
              <span className="text-[0.72rem] text-muted-foreground">OS</span>
              <div className="flex flex-wrap gap-1.5">
                {OS_OPTIONS.map((o) => {
                  const active = (current.os ?? '').split(',').some((t) => t.trim() === o.value)
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleOS(o.value)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[0.74rem] transition-colors',
                        active
                          ? 'border-foreground/30 bg-foreground/[0.06] text-foreground'
                          : 'border-foreground/10 text-muted-foreground hover:bg-foreground/[0.03]'
                      )}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-muted-foreground">Purpose (optional)</span>
              <Input
                value={current.purpose}
                onChange={(e) => setField('purpose', e.target.value)}
                placeholder="One line describing what it does"
                aria-label="Purpose"
              />
            </label>
            <div className="flex justify-between">
              {step > 0 ? (
                <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button size="sm" disabled={!requiredFilled} onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// unionEventsFor returns every event supported by any of the given agent ids.
function unionEventsFor(agentOptions: AgentOption[], agentIds: string[]): string[] {
  const seen = new Set<string>()
  for (const a of agentOptions) {
    if (!agentIds.includes(a.id)) continue
    for (const ev of a.events) seen.add(ev)
  }
  return [...seen]
}

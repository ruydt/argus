import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CommunityScript } from '@/types'

import type { SimulateResult } from './useCommunity'

type CommunityRowProps = {
  script: CommunityScript
  index: number
  busy: boolean
  onInstall: (id: string) => void
  getBody: (id: string) => Promise<string>
  simulate: (id: string, payload: unknown) => Promise<SimulateResult>
}

const SAMPLE_PAYLOAD = {
  session_id: 'sim',
  transcript_path: '/tmp/argus-sim.jsonl',
  hook_event_name: 'PreToolUse',
}

export function CommunityRow({
  script,
  index,
  busy,
  onInstall,
  getBody,
  simulate,
}: CommunityRowProps) {
  const [body, setBody] = useState<string | null>(null)
  const [sim, setSim] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  async function toggleSource() {
    if (body !== null) {
      setBody(null)
      return
    }
    setWorking(true)
    try {
      setBody(await getBody(script.id))
    } catch {
      setBody('// failed to load source')
    } finally {
      setWorking(false)
    }
  }

  async function runSim() {
    setWorking(true)
    try {
      const r = await simulate(script.id, SAMPLE_PAYLOAD)
      setSim(`exit ${r.exit_code} · ${r.duration_ms}ms\n${r.stdout}${r.stderr}`)
    } catch {
      setSim('simulation failed')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="border-b border-white/[0.06] px-3 py-3 hover:bg-white/[0.02]">
      <div className="flex items-center gap-4">
        <span className="w-6 shrink-0 text-right text-[0.72rem] tabular-nums text-[#555]">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[#e5e5e5]">{script.title}</span>
            <span className="truncate font-mono text-[0.7rem] text-[#666]">
              {script.author}/{script.id}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[0.72rem] text-[#888]">{script.purpose}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <Badge variant="outline" className="border-amber-600/40 text-amber-500">
            community
          </Badge>
          {script.event ? <Badge variant="outline">{script.event}</Badge> : null}
          {!script.runtime_available ? (
            <Badge variant="outline" className="border-amber-600/40 text-amber-500">
              needs {script.runtime}
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" disabled={busy || working} onClick={toggleSource}>
            Source
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || working || !script.runtime_available}
            onClick={runSim}
          >
            Test
          </Button>
          {!script.installed ? (
            <Button size="sm" disabled={busy || working} onClick={() => onInstall(script.id)}>
              Install
            </Button>
          ) : (
            <Badge variant="secondary" className="px-2.5 py-1">
              Installed
            </Badge>
          )}
        </div>
      </div>
      {body !== null ? (
        <pre className="mt-2 max-h-[40vh] overflow-auto rounded-md bg-black/40 p-3 text-[0.72rem] text-[#bbb]">
          {body}
        </pre>
      ) : null}
      {sim !== null ? (
        <pre className="mt-2 max-h-[30vh] overflow-auto rounded-md border border-white/[0.08] bg-black/20 p-3 text-[0.72rem] text-[#bbb]">
          {sim}
        </pre>
      ) : null}
    </div>
  )
}

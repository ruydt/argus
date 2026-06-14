import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CommunityScript } from '@/types'

type CommunityRowProps = {
  script: CommunityScript
  index: number
  busy: boolean
  onInstall: (id: string) => void
  getBody: (id: string) => Promise<string>
}

function filenameOf(script: CommunityScript): string {
  return script.source.split('/').pop() ?? script.id
}

export function CommunityRow({ script, index, busy, onInstall, getBody }: CommunityRowProps) {
  const [body, setBody] = useState<string | null>(null)
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

  return (
    <div className="border-b border-white/[0.06] px-3 py-3 hover:bg-white/[0.02]">
      <div className="flex items-center gap-4">
        <span className="w-6 shrink-0 text-right text-[0.72rem] tabular-nums text-[#555]">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <span className="truncate font-mono text-sm text-[#e5e5e5]">{filenameOf(script)}</span>
        </div>
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <Badge variant="outline" className="border-amber-600/40 text-amber-500">
            by {script.author}
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
    </div>
  )
}

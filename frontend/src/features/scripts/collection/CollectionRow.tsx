import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CollectionScript } from '@/types'

type CollectionRowProps = {
  script: CollectionScript
  index: number
  onInstall: (id: string) => void
  onRemove: (id: string) => void
  busy: boolean
}

export function CollectionRow({ script, index, onInstall, onRemove, busy }: CollectionRowProps) {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-3 py-3 hover:bg-white/[0.02]">
      <span className="w-6 shrink-0 text-right text-[0.72rem] tabular-nums text-[#555]">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[#e5e5e5]">{script.title}</span>
          <span className="truncate font-mono text-[0.7rem] text-[#666]">{script.filename}</span>
        </div>
        {script.purpose ? (
          <p className="mt-0.5 truncate text-[0.72rem] text-[#888]">{script.purpose}</p>
        ) : null}
      </div>
      <div className="hidden shrink-0 items-center gap-1 md:flex">
        <Badge variant="outline">{script.origin}</Badge>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {script.installed ? (
          <Badge variant="secondary">Installed</Badge>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => onInstall(script.id)}>
            Install
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onRemove(script.id)}>
          Remove
        </Button>
      </div>
    </div>
  )
}

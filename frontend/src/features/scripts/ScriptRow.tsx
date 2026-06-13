import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ScriptPackage } from '@/types'

type ScriptRowProps = {
  script: ScriptPackage
  index: number
  onInstall: (id: string) => void
  onDelete: (id: string) => void
  busy: boolean
  // When false, an installed script shows a static "Installed" label instead of
  // a Delete action (the All/Bundles tabs); the Installed tab passes true.
  canDelete?: boolean
  onAddToCollection?: (id: string) => void
  onPublish?: (script: ScriptPackage) => void
}

export function ScriptRow({
  script,
  index,
  onInstall,
  onDelete,
  busy,
  canDelete = false,
  onAddToCollection,
  onPublish,
}: ScriptRowProps) {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-3 py-3 hover:bg-white/[0.02]">
      <span className="w-6 shrink-0 text-right text-[0.72rem] tabular-nums text-[#555]">
        {index}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[#e5e5e5]">{script.title}</span>
          <span className="truncate font-mono text-[0.7rem] text-[#666]">{script.id}</span>
        </div>
        <p className="mt-0.5 truncate text-[0.72rem] text-[#888]">{script.purpose}</p>
      </div>

      <div className="hidden shrink-0 items-center gap-1 md:flex">
        <Badge variant="outline">{script.event}</Badge>
        {!script.runtime_available ? (
          <Badge variant="outline" className="border-amber-600/40 text-amber-500">
            needs {script.runtime}
          </Badge>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {onAddToCollection ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onAddToCollection(script.id)}
          >
            + Collection
          </Button>
        ) : null}
        {onPublish ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onPublish(script)}>
            Publish
          </Button>
        ) : null}
        {!script.installed ? (
          <Button size="sm" disabled={busy} onClick={() => onInstall(script.id)}>
            Install
          </Button>
        ) : canDelete ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => onDelete(script.id)}
          >
            Delete
          </Button>
        ) : (
          <Badge variant="secondary" className="px-2.5 py-1">
            Installed
          </Badge>
        )}
      </div>
    </div>
  )
}

import { MoreVertical } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CollectionEntry } from '@/types'

type CollectionRowProps = {
  entry: CollectionEntry
  index: number
  busy: boolean
  onTest: (entry: CollectionEntry) => void
  onSaveToGist: (filename: string) => void
  onInstall: (id: string) => void
  onRemoveLocal: (filename: string) => void
  onRemoveGist: (id: string) => void
  onRemoveBoth: (entry: CollectionEntry) => void
}

export function CollectionRow({
  entry,
  index,
  busy,
  onTest,
  onSaveToGist,
  onInstall,
  onRemoveLocal,
  onRemoveGist,
  onRemoveBoth,
}: CollectionRowProps) {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-3 py-3 hover:bg-white/[0.02]">
      <span className="w-6 shrink-0 text-right text-[0.72rem] tabular-nums text-[#555]">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[#e5e5e5]">{entry.title}</span>
          <span className="truncate font-mono text-[0.7rem] text-[#666]">{entry.filename}</span>
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-1 md:flex">
        <Badge
          variant={entry.local ? 'secondary' : 'outline'}
          className={entry.local ? '' : 'opacity-40'}
        >
          Local
        </Badge>
        <Badge
          variant={entry.gist ? 'secondary' : 'outline'}
          className={entry.gist ? '' : 'opacity-40'}
        >
          Gist
        </Badge>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {entry.gist && !entry.local ? (
          <Button size="sm" disabled={busy} onClick={() => onInstall(entry.id)}>
            Install
          </Button>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy} aria-label="Actions">
              <MoreVertical className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <div className="flex flex-col">
              {entry.local ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onTest(entry)}
                >
                  Test
                </Button>
              ) : null}
              {entry.local && !entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onSaveToGist(entry.filename)}
                >
                  Save to gist
                </Button>
              ) : null}
              {entry.local ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onRemoveLocal(entry.filename)}
                >
                  Remove local
                </Button>
              ) : null}
              {entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onRemoveGist(entry.id)}
                >
                  Remove from gist
                </Button>
              ) : null}
              {entry.local && entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-destructive"
                  onClick={() => onRemoveBoth(entry)}
                >
                  Remove both
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

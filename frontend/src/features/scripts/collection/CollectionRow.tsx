import { useRef, useState } from 'react'
import { Cloud, HardDrive, MoreVertical } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CollectionEntry } from '@/types'

import { ScriptViewerModal } from '../ScriptViewerModal'

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
  getBody: (entry: CollectionEntry) => Promise<string>
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
  getBody,
}: CollectionRowProps) {
  const [viewing, setViewing] = useState(false)
  // Two clickable surfaces (content + action column) cover the whole row so any
  // non-button area opens the viewer, while the action column stays w-40 to line
  // up with the header. pointer-down-capture fires on the real DOM target before
  // Radix re-dispatches the ⋯ trigger click, so button presses are skipped.
  const skipOpen = useRef(false)
  function openFromAction() {
    if (skipOpen.current) {
      skipOpen.current = false
      return
    }
    setViewing(true)
  }
  return (
    <div className="flex items-center border-b border-black/[0.06] hover:bg-black/[0.02]">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setViewing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setViewing(true)
          }
        }}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 py-3.5 pr-4 pl-2"
      >
        <span className="w-7 shrink-0 text-right text-[0.8rem] tabular-nums text-[#666666]">
          {index}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span className="truncate text-sm font-semibold text-[#171717]">
            {entry.filename}
          </span>
          {entry.author ? (
            <span className="truncate text-[0.8rem] text-[#666666]">{entry.author}</span>
          ) : null}
        </div>
        <div className="hidden w-36 shrink-0 items-center md:flex">
          {entry.event ? <Badge variant="outline">{entry.event}</Badge> : null}
        </div>
        <TooltipProvider delayDuration={100}>
          <div className="hidden w-44 shrink-0 items-center gap-2.5 text-black/55 md:flex">
            {entry.local ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <HardDrive className="size-4" aria-label="Installed in ~/.argus/hooks" />
                </TooltipTrigger>
                <TooltipContent>Installed in ~/.argus/hooks</TooltipContent>
              </Tooltip>
            ) : null}
            {entry.gist ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Cloud className="size-4" aria-label="Saved on gist" />
                </TooltipTrigger>
                <TooltipContent>Saved on gist</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </TooltipProvider>
      </div>

      <ScriptViewerModal
        title={entry.filename}
        open={viewing}
        onOpenChange={setViewing}
        load={() => getBody(entry)}
      />

      <div
        className="flex w-40 shrink-0 cursor-pointer items-center justify-end gap-2 py-3.5 pr-2"
        onPointerDownCapture={(e) => {
          skipOpen.current = (e.target as HTMLElement).closest('button') != null
        }}
        onClick={openFromAction}
      >
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
                  className="menu-item justify-start"
                  onClick={() => onTest(entry)}
                >
                  Test
                </Button>
              ) : null}
              {entry.gist && !entry.local ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="menu-item justify-start"
                  onClick={() => onInstall(entry.id)}
                >
                  Install
                </Button>
              ) : null}
              {entry.local && !entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="menu-item justify-start"
                  onClick={() => onSaveToGist(entry.filename)}
                >
                  Save to gist
                </Button>
              ) : null}
              {entry.local ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="menu-item justify-start hover:text-destructive"
                  onClick={() => onRemoveLocal(entry.filename)}
                >
                  Uninstall
                </Button>
              ) : null}
              {entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="menu-item justify-start hover:text-destructive"
                  onClick={() => onRemoveGist(entry.id)}
                >
                  Remove from gist
                </Button>
              ) : null}
              {entry.local && entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="menu-item justify-start hover:text-destructive"
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

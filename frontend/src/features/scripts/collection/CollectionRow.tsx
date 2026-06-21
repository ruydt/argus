import { useRef, useState } from 'react'
import {
  Cloud,
  CloudOff,
  CloudUpload,
  Download,
  FolderOpen,
  HardDrive,
  MoreVertical,
  Play,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CollectionEntry } from '@/types'

import { AgentLogos } from '../AgentLogos'
import { EventBadges } from '../EventBadges'
import { OsIcons } from '../OsIcons'
import { ScriptViewerModal } from '../ScriptViewerModal'

type CollectionRowProps = {
  entry: CollectionEntry
  index: number
  busy: boolean
  onTest: (entry: CollectionEntry) => void
  onReveal: (filename: string) => void
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
  onReveal,
  onSaveToGist,
  onInstall,
  onRemoveLocal,
  onRemoveGist,
  onRemoveBoth,
  getBody,
}: CollectionRowProps) {
  const [viewing, setViewing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Close the menu before firing an action: prevents spamming the same item (or a
  // second destructive one) while the request is in flight. The parent's run()
  // guard is the real backstop; this is the UX half.
  function act(fn: () => void) {
    setMenuOpen(false)
    fn()
  }
  // One flat row matches the header grid exactly (each column the same width as
  // its header cell). Row-click opens the viewer; pointer-down-capture fires on
  // the real DOM target before Radix re-dispatches the ⋯ trigger click, so
  // button presses are skipped.
  const skipOpen = useRef(false)
  function openFromAction() {
    if (skipOpen.current) {
      skipOpen.current = false
      return
    }
    setViewing(true)
  }
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openFromAction}
        onPointerDownCapture={(e) => {
          skipOpen.current = (e.target as HTMLElement).closest('button') != null
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setViewing(true)
          }
        }}
        className="flex cursor-pointer items-center gap-4 border-b border-foreground/[0.08] px-2 py-3.5 hover:bg-foreground/[0.02]"
      >
        <span className="w-7 shrink-0 text-right text-[0.8rem] tabular-nums text-muted-foreground">
          {index}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{entry.filename}</span>
          {entry.author ? (
            <span className="truncate text-[0.8rem] text-muted-foreground">{entry.author}</span>
          ) : null}
        </div>
        <div className="hidden w-40 shrink-0 flex-wrap items-center gap-1 md:flex">
          <EventBadges events={entry.events} />
        </div>
        <div className="hidden w-24 shrink-0 md:flex">
          <AgentLogos agents={entry.agents} />
        </div>
        <div className="hidden w-24 shrink-0 md:flex">
          <OsIcons os={entry.os} />
        </div>
        <TooltipProvider delayDuration={100}>
          <div className="hidden w-24 shrink-0 items-center gap-2.5 text-foreground/55 md:flex">
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
        <div className="flex w-20 shrink-0 items-center justify-end gap-0.5">
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label="Actions"
                data-tour={index === 1 ? 'collection-actions' : undefined}
              >
                <MoreVertical className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              <div className="flex flex-col">
                {entry.local ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="menu-item justify-start"
                    onClick={() => act(() => onTest(entry))}
                  >
                    <Play className="size-4" />
                    Test
                  </Button>
                ) : null}
                {entry.local ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="menu-item justify-start"
                    onClick={() => act(() => onReveal(entry.filename))}
                  >
                    <FolderOpen className="size-4" />
                    Show in folder
                  </Button>
                ) : null}
                {entry.gist && !entry.local ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="menu-item justify-start"
                    onClick={() => act(() => onInstall(entry.id))}
                  >
                    <Download className="size-4" />
                    Install
                  </Button>
                ) : null}
                {entry.local && !entry.gist ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="menu-item justify-start"
                    onClick={() => act(() => onSaveToGist(entry.filename))}
                  >
                    <CloudUpload className="size-4" />
                    Save to gist
                  </Button>
                ) : null}
                <div className="mx-auto my-1 h-px w-[85%] bg-border" />
                {entry.local ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="danger-action justify-start"
                    onClick={() => act(() => onRemoveLocal(entry.filename))}
                  >
                    <Trash2 className="size-4" />
                    Uninstall
                  </Button>
                ) : null}
                {entry.gist ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="danger-action justify-start"
                    onClick={() => act(() => onRemoveGist(entry.id))}
                  >
                    <CloudOff className="size-4" />
                    Remove from gist
                  </Button>
                ) : null}
                {entry.local && entry.gist ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="danger-action justify-start"
                    onClick={() => act(() => onRemoveBoth(entry))}
                  >
                    <Trash2 className="size-4" />
                    Remove both
                  </Button>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <ScriptViewerModal
        title={entry.filename}
        open={viewing}
        onOpenChange={setViewing}
        load={() => getBody(entry)}
      />
    </>
  )
}

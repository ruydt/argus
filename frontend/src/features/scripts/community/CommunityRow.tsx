import { useRef, useState } from 'react'
import { CheckCircle2, Download } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CommunityScript } from '@/types'

import { ScriptViewerModal } from '../ScriptViewerModal'

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
  const [viewing, setViewing] = useState(false)
  // Two clickable surfaces cover every pixel without an outer-row onClick (Radix
  // re-dispatches the trigger click on a portaled div that bubbles up). The
  // action surface skips button presses via pointer-down-capture.
  const skipOpen = useRef(false)
  function openFromAction() {
    if (skipOpen.current) {
      skipOpen.current = false
      return
    }
    setViewing(true)
  }

  return (
    <div className="flex items-center border-b border-foreground/[0.08] hover:bg-foreground/[0.02]">
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
        <span className="w-7 shrink-0 text-right text-[0.8rem] tabular-nums text-muted-foreground">
          {index}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {filenameOf(script)}
          </span>
          <span className="truncate text-[0.8rem] text-muted-foreground">{script.author}</span>
        </div>
        <div className="hidden w-44 shrink-0 items-center gap-1 md:flex">
          {script.event ? <Badge variant="outline">{script.event}</Badge> : null}
          {!script.runtime_available ? (
            <Badge variant="outline" className="border-amber-600/40 text-amber-500">
              needs {script.runtime}
            </Badge>
          ) : null}
        </div>
      </div>

      <div
        className="flex w-40 shrink-0 cursor-pointer items-center justify-end gap-2 py-3.5 pr-2"
        onPointerDownCapture={(e) => {
          skipOpen.current = (e.target as HTMLElement).closest('button') != null
        }}
        onClick={openFromAction}
      >
        <TooltipProvider delayDuration={100}>
          {!script.installed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onInstall(script.id)}
                  aria-label="Install script"
                  className="size-8 p-0"
                >
                  <Download className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Install</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex size-8 items-center justify-center text-green-500">
                  <CheckCircle2 className="size-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Installed</TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>

      <ScriptViewerModal
        title={filenameOf(script)}
        open={viewing}
        onOpenChange={setViewing}
        load={() => getBody(script.id)}
      />
    </div>
  )
}

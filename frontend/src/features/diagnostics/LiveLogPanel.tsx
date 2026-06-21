import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { DiagnosticsFileEntry } from './types'
import { formatBytes } from './utils'

// Map the ~/.argus log file name to the backend's whitelisted ?file= param.
const FILE_PARAM: Record<string, string> = {
  'argus.log': 'argus',
  'hook-scripts.log': 'hook-scripts',
}

const HOOK_SCRIPTS_LOG = 'hook-scripts.log'
const POLL_MS = 2000
const TAIL_LINES = 200

type LiveLogPanelProps = {
  logs: DiagnosticsFileEntry[]
  onCleared?: () => void
}

// hook-scripts.log lines lead with a UTC ISO timestamp; swap it for the viewer's
// local time. Everything else (agent, session, script, level, message) stays as
// the script wrote it, so the line renders raw — same style as argus.log.
function localizeTime(line: string): string {
  const sp = line.indexOf(' ')
  if (sp === -1) return line
  const d = new Date(line.slice(0, sp))
  return Number.isNaN(d.getTime()) ? line : d.toLocaleString() + line.slice(sp)
}

// LiveLogPanel tails the ~/.argus log files inline, refreshing every POLL_MS.
export function LiveLogPanel({ logs, onCleared }: LiveLogPanelProps) {
  const available = useMemo(() => logs.filter((l) => l.exists && FILE_PARAM[l.name]), [logs])
  const [selected, setSelected] = useState('')
  const [lines, setLines] = useState<string[]>([])
  // Default paused: tailing is opt-in, so the panel doesn't poll until the user
  // hits Resume. We still load one snapshot below so it isn't blank on arrival.
  const [paused, setPaused] = useState(true)
  const [clearing, setClearing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Derive the effective file instead of syncing state in an effect: fall back to
  // the first available log when the selection isn't (yet) valid.
  const activeName = available.some((l) => l.name === selected)
    ? selected
    : (available[0]?.name ?? '')

  useEffect(() => {
    const param = FILE_PARAM[activeName]
    if (!param) return
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch(`/api/diagnostics/log-tail?file=${param}&lines=${TAIL_LINES}`)
        if (!r.ok) return
        const d = (await r.json()) as { lines?: string[] }
        if (!cancelled) setLines(d.lines ?? [])
      } catch {
        /* transient — keep last lines, retry next tick */
      }
    }
    // Always pull one snapshot so the panel shows the current tail even while
    // paused; only the live polling interval is gated by `paused`.
    void load()
    if (paused)
      return () => {
        cancelled = true
      }
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [activeName, paused])

  const clearLog = async () => {
    const param = FILE_PARAM[activeName]
    if (!param || clearing) return
    setClearing(true)
    try {
      const r = await fetch(`/api/diagnostics/log-clear?file=${param}`, { method: 'POST' })
      if (r.ok) {
        setLines([])
        onCleared?.()
      }
    } catch {
      /* leave the view as-is on failure */
    } finally {
      setClearing(false)
    }
  }

  // Keep the newest lines in view (live tail).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, activeName])

  const display =
    activeName === HOOK_SCRIPTS_LOG ? lines.map(localizeTime).join('\n') : lines.join('\n')

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>Live Logs</CardTitle>
        {available.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[12px]"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[12px] danger-action"
              onClick={clearLog}
              disabled={clearing}
              title="Clear this log file and reclaim its disk space"
            >
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {available.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No logs yet — files appear under ~/.argus once argus writes them.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {available.map((log) => {
                const active = log.name === activeName
                return (
                  <button
                    key={log.name}
                    type="button"
                    onClick={() => setSelected(log.name)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.72rem] transition-colors',
                      active
                        ? 'border-foreground/30 bg-foreground/[0.06] text-foreground'
                        : 'border-foreground/10 text-muted-foreground hover:bg-foreground/[0.03]'
                    )}
                  >
                    {log.name}
                    {log.sizeBytes !== null ? (
                      <span className="text-muted-foreground">{formatBytes(log.sizeBytes)}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            <div
              ref={scrollRef}
              className="h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap"
            >
              {lines.length > 0 ? display : 'Log is empty.'}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

import { useState } from 'react'
import { json } from '@codemirror/lang-json'
import CodeMirror from '@uiw/react-codemirror'
import { RefreshCw, Terminal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { hookerEditorTheme, hookerHighlighting, editableExtensions } from '@/lib/editorTheme'
import { getTemplate } from './hookTemplates'
import type { AgentKey, HooksConfig } from './types'

type SimulateResult = {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
}

export type SimulatorTabProps = {
  agent: AgentKey
  config: HooksConfig | null
}

type CommandOption = {
  label: string
  command: string
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function SimulatorTab({ agent, config }: SimulatorTabProps) {
  const [eventType, setEventType] = useState<string>('')
  const [command, setCommand] = useState<string>('')
  const [payloadJSON, setPayloadJSON] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventTypes: string[] = config
    ? Object.entries(config.hooks)
        .filter(([, groups]) => groups.some((g) => g.hooks.length > 0))
        .map(([et]) => et)
        .sort()
    : []

  const commandOptions: CommandOption[] = (() => {
    if (!config || !eventType) return []
    const groups = config.hooks[eventType] ?? []
    const opts: CommandOption[] = []
    groups.forEach((g, gi) => {
      g.hooks.forEach((h, hi) => {
        opts.push({
          label: `group ${gi + 1} hook ${hi + 1} → ${truncate(h.command, 60)}`,
          command: h.command,
        })
      })
    })
    return opts
  })()

  function handleEventTypeChange(et: string) {
    setEventType(et)
    setCommand('')
    setResult(null)
    setError(null)
    setPayloadJSON(JSON.stringify(getTemplate(agent, et), null, 2))
  }

  function handleCommandChange(cmd: string) {
    setCommand(cmd)
    setResult(null)
    setError(null)
  }

  async function handleRun() {
    if (!command) return
    let payload: unknown
    try {
      payload = JSON.parse(payloadJSON)
    } catch {
      setError('Payload JSON is invalid')
      return
    }
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const resp = await fetch('/api/hooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      })
      if (!resp.ok) {
        const msg = await resp.text()
        setError(`Server error: ${msg}`)
        return
      }
      setResult((await resp.json()) as SimulateResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  if (!config || eventTypes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-foreground">No hooks configured</p>
        <p className="text-xs text-muted-foreground">
          Add hooks in the Structured or JSON view first
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="flex gap-3">
        <Select value={eventType} onValueChange={handleEventTypeChange}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select event type" />
          </SelectTrigger>
          <SelectContent>
            {eventTypes.map((et) => (
              <SelectItem key={et} value={et}>
                {et}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={command}
          onValueChange={handleCommandChange}
          disabled={commandOptions.length === 0}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select hook command" />
          </SelectTrigger>
          <SelectContent>
            {commandOptions.map((opt) => (
              <SelectItem key={opt.command} value={opt.command}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {eventType && (
        <div className="rounded-md border overflow-hidden">
          <CodeMirror
            value={payloadJSON}
            onChange={setPayloadJSON}
            extensions={[json(), hookerEditorTheme, hookerHighlighting, ...editableExtensions]}
            theme="none"
            height="280px"
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              bracketMatching: true,
              autocompletion: false,
              foldGutter: true,
            }}
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="default"
          size="sm"
          onClick={() => void handleRun()}
          disabled={!command || running}
        >
          {running ? (
            <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
          ) : (
            <Terminal className="size-3.5 mr-1.5" />
          )}
          Run
        </Button>
      </div>

      {error !== null && <p className="text-[12px] text-destructive">{error}</p>}

      {result !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={result.exit_code === 0 ? 'default' : 'destructive'}>
              exit {result.exit_code}
            </Badge>
            <span className="text-[12px] text-muted-foreground">{result.duration_ms}ms</span>
          </div>

          <div className="rounded-md border overflow-hidden bg-[#0d1117]">
            <ScrollArea className="h-[180px]">
              <pre className="p-3 text-[12px] font-mono text-[#e6edf3] whitespace-pre-wrap break-all">
                {result.stdout || <span className="text-[#8b949e]">(no output)</span>}
              </pre>
            </ScrollArea>
          </div>

          {result.stderr && (
            <div className="rounded-md border border-destructive/40 overflow-hidden bg-[rgba(255,95,86,0.05)]">
              <ScrollArea className="h-[120px]">
                <pre className="p-3 text-[12px] font-mono text-destructive whitespace-pre-wrap break-all">
                  {result.stderr}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

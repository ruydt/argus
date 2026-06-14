import { useEffect, useRef, useState } from 'react'
import { json } from '@codemirror/lang-json'
import CodeMirror from '@uiw/react-codemirror'
import { Check, RefreshCw, Terminal } from 'lucide-react'
import { CopyIconButton } from '@/components/shared/CopyIconButton'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { argusEditorTheme, argusHighlighting, editableExtensions } from '@/lib/editorTheme'
import { getTemplate, HOOK_TEMPLATES } from './hookTemplates'
import type { AgentKey, HooksConfig } from './types'

const CUSTOM_VALUE = '__custom__'

type HookScript = { name: string; path: string }

const SCRIPT_RUNNERS: Record<string, string> = {
  '.js': 'node',
  '.sh': 'sh',
  '.py': 'python3',
}

function scriptExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i)
}

function composeScriptCommand(script: HookScript, agent: AgentKey): string {
  const runner = SCRIPT_RUNNERS[scriptExtension(script.name)]
  const base = `${runner} "${script.path}"`
  return agent === 'claudecode' ? `CLAUDECODE=1 ${base}` : base
}

type SimulateResult = {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
}

export type SimulatorTabProps = {
  agent: AgentKey
  config: HooksConfig | null
  initialScript?: string
  // Lifted state — persists across tab switches and page navigation (sessionStorage)
  eventType: string
  onEventTypeChange: (et: string) => void
  commandValue: string
  onCommandValueChange: (v: string) => void
  payloadJSON: string
  onPayloadJSONChange: (json: string) => void
  customCommandText: string
  onCustomCommandTextChange: (v: string) => void
  onApply: (eventType: string, command: string) => Promise<void>
  applying: boolean
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function SimulatorTab({
  agent,
  config,
  initialScript,
  eventType,
  onEventTypeChange,
  commandValue,
  onCommandValueChange,
  payloadJSON,
  onPayloadJSONChange,
  customCommandText,
  onCustomCommandTextChange,
  onApply,
  applying,
}: SimulatorTabProps) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [hookScripts, setHookScripts] = useState<HookScript[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/diagnostics')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { fileSystem?: { hooks?: HookScript[] } } | null) => {
        if (cancelled || !data?.fileSystem?.hooks) return
        setHookScripts(
          data.fileSystem.hooks.filter((h) => scriptExtension(h.name) in SCRIPT_RUNNERS)
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const preselectApplied = useRef(false)
  useEffect(() => {
    if (preselectApplied.current) return
    if (!initialScript || hookScripts.length === 0) return
    const match = hookScripts.find((h) => h.name === initialScript)
    if (!match) return
    preselectApplied.current = true
    onCommandValueChange(composeScriptCommand(match, agent))
  }, [initialScript, hookScripts, agent, onCommandValueChange])

  const eventTypes = Object.keys(HOOK_TEMPLATES[agent]).sort()

  const commandOptions = (() => {
    if (!eventType) return []
    const groups = config?.hooks[eventType] ?? []
    const opts: { label: string; value: string; timeout?: number }[] = []
    // Dedupe by command — option value IS the command string, and duplicate values
    // make Radix Select render every matching item's label in the trigger.
    const seen = new Set<string>()
    groups.forEach((g, gi) => {
      g.hooks.forEach((h, hi) => {
        if (seen.has(h.command)) return
        seen.add(h.command)
        opts.push({
          label: `group ${gi + 1} hook ${hi + 1} → ${truncate(h.command, 60)}`,
          value: h.command,
          timeout: h.timeout,
        })
      })
    })
    hookScripts.forEach((script) => {
      const command = composeScriptCommand(script, agent)
      if (seen.has(command)) return
      seen.add(command)
      opts.push({ label: `${script.name}`, value: command })
    })
    return opts
  })()

  const commandSelectOptions = [
    ...commandOptions.map(({ label, value }) => ({ label, value })),
    { label: 'Custom command…', value: CUSTOM_VALUE },
  ]

  const effectiveCommand = commandValue === CUSTOM_VALUE ? customCommandText.trim() : commandValue
  const selectedHookTimeout =
    commandValue === CUSTOM_VALUE
      ? undefined
      : commandOptions.find((opt) => opt.value === commandValue)?.timeout
  const canRun = effectiveCommand.length > 0 && !running
  const canApply = commandValue === CUSTOM_VALUE && customCommandText.trim().length > 0 && !applying

  function handleEventTypeChange(et: string) {
    onEventTypeChange(et)
    onCommandValueChange('')
    onPayloadJSONChange(JSON.stringify(getTemplate(agent, et), null, 2))
    setResult(null)
    setError(null)
  }

  function handleCommandValueChange(v: string) {
    onCommandValueChange(v)
    setResult(null)
    setError(null)
  }

  async function handleRun() {
    if (!effectiveCommand) return
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
        body: JSON.stringify({
          command: effectiveCommand,
          payload,
          timeout_seconds: selectedHookTimeout,
        }),
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

  async function handleApply() {
    const cmd = customCommandText.trim()
    if (!cmd || !eventType) return
    await onApply(eventType, cmd)
    setApplied(true)
    setTimeout(() => setApplied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="flex gap-3">
        <SearchableSelect
          value={eventType}
          onValueChange={handleEventTypeChange}
          options={eventTypes.map((et) => ({ label: et, value: et }))}
          placeholder="Select hook event"
          ariaLabel="Select hook event"
          className="flex-1"
        />

        <SearchableSelect
          value={commandValue}
          onValueChange={handleCommandValueChange}
          options={commandSelectOptions}
          placeholder="command/script (~/.argus/hooks/...)"
          ariaLabel="command/script (~/.argus/hooks/...)"
          disabled={!eventType}
          className="flex-1"
        />
      </div>

      {commandValue === CUSTOM_VALUE && (
        <Input
          value={customCommandText}
          onChange={(e) => onCustomCommandTextChange(e.target.value)}
          placeholder="Enter shell command, e.g. curl -s http://127.0.0.1:10804/api/hook -d @-"
          className="font-mono text-[13px]"
        />
      )}

      {eventType && (
        <div className="relative rounded-md border overflow-hidden">
          <CopyIconButton
            text={payloadJSON}
            label="JSON"
            className="absolute top-2 right-2 z-10 size-7 text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/10"
          />
          <CodeMirror
            value={payloadJSON}
            onChange={onPayloadJSONChange}
            extensions={[json(), argusEditorTheme, argusHighlighting, ...editableExtensions]}
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

      {eventType && (
        <div className="flex items-center justify-end gap-2">
          {commandValue === CUSTOM_VALUE && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleApply()}
              disabled={!canApply}
            >
              {applying ? (
                <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
              ) : applied ? (
                <Check className="size-3.5 mr-1.5 text-green-400" />
              ) : null}
              Apply to config
            </Button>
          )}
          <Button variant="default" size="sm" onClick={() => void handleRun()} disabled={!canRun}>
            {running ? (
              <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Terminal className="size-3.5 mr-1.5" />
            )}
            Run
          </Button>
        </div>
      )}

      {error !== null && <p className="text-[12px] text-destructive">{error}</p>}

      {result !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={result.exit_code === 0 ? 'default' : 'destructive'}>
              exit {result.exit_code}
            </Badge>
            <span className="text-[12px] text-muted-foreground">{result.duration_ms}ms</span>
          </div>

          <div className="relative rounded-md border overflow-hidden bg-[#0d1117]">
            {result.stdout && (
              <CopyIconButton
                text={result.stdout}
                label="output"
                className="absolute top-2 right-2 z-10 size-7 text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/10"
              />
            )}
            <ScrollArea className="h-[180px]">
              <pre className="p-3 text-[12px] font-mono text-[#e6edf3] whitespace-pre-wrap break-all">
                {result.stdout || <span className="text-[#8b949e]">(no output)</span>}
              </pre>
            </ScrollArea>
          </div>

          {result.stderr && (
            <div className="relative rounded-md border border-destructive/40 overflow-hidden bg-[rgba(255,95,86,0.05)]">
              <CopyIconButton
                text={result.stderr}
                label="stderr"
                className="absolute top-2 right-2 z-10 size-7 text-[#8b949e] hover:text-[rgba(255,95,86,0.9)] hover:bg-white/5"
              />
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

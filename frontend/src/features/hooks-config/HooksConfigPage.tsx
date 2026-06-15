import { useEffect, useRef, useState } from 'react'
import { json } from '@codemirror/lang-json'
import CodeMirror from '@uiw/react-codemirror'
import { AppWindowIcon, CodeIcon, ExternalLink, RefreshCw, Save, Terminal } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { CopyIconButton } from '@/components/shared/CopyIconButton'
import { PageHeader, PageShell } from '@/components/shared/PageShell'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { argusEditorTheme, argusHighlighting, editableExtensions } from '@/lib/editorTheme'
import { StructuredEditor } from './StructuredEditor'
import { SimulatorTab } from './SimulatorTab'
import { useHooksConfig } from './hooks/useHooksConfig'
import type { AgentKey, HookEntry, HookGroup, HooksConfig, HooksConfigState } from './types'

type ViewMode = 'structured' | 'json' | 'simulator'

const SIM_STORAGE_KEY = 'argus:sim'
const AGENT_TAB_KEY = 'argus:hooks-agent'
const VIEW_MODE_KEY = 'argus:hooks-view'

function readStorageString(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorageString(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    /* quota exceeded */
  }
}

type SimCache = {
  eventType: string
  commandValue: string
  payloadJSON: string
  customCommandText: string
}

function readSimCache(): SimCache | null {
  try {
    const raw = sessionStorage.getItem(SIM_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SimCache) : null
  } catch {
    return null
  }
}

type SimulatorCacheProps = {
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
  initialScript?: string
}

type AgentTabContentProps = {
  agent: AgentKey
  state: HooksConfigState
  viewMode: ViewMode
  sim: SimulatorCacheProps
}

function AgentTabContent({ agent, state, viewMode, sim }: AgentTabContentProps) {
  const { config, draftJSON, loading, error, saveError, setDraftJSON, setConfig, reload } = state

  const jsonIsValid = (() => {
    try {
      JSON.parse(draftJSON)
      return true
    } catch {
      return false
    }
  })()

  if (loading) {
    return (
      <div className="flex flex-col gap-3 mt-4" aria-busy="true">
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
      </div>
    )
  }

  if (error !== null) {
    return (
      <Card className="p-6 flex flex-col items-center gap-3 text-center mt-4">
        <p className="text-sm text-foreground">Failed to load hooks config</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={reload}>
          Retry
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4 mt-4">
      {viewMode === 'structured' && config !== null && (
        <StructuredEditor
          config={config}
          agent={agent}
          isDirty={state.isDirty}
          onDiscardChanges={state.discardChanges}
          onChange={setConfig}
        />
      )}

      {viewMode === 'json' && (
        <div className="flex flex-col gap-1">
          <section
            className={cn(
              'relative rounded-md border overflow-hidden',
              !jsonIsValid && 'border-destructive'
            )}
            aria-label="Hooks config JSON"
          >
            <CopyIconButton
              text={draftJSON}
              label="JSON"
              className="absolute top-2 right-2 z-10 size-7 text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/10"
            />
            <CodeMirror
              value={draftJSON}
              onChange={(value) => setDraftJSON(value)}
              extensions={[json(), argusEditorTheme, argusHighlighting, ...editableExtensions]}
              theme="none"
              height="calc(100dvh - 220px)"
              minHeight="320px"
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                bracketMatching: true,
                autocompletion: false,
                foldGutter: true,
              }}
            />
          </section>
          {!jsonIsValid && <p className="text-[12px] text-destructive mt-0.5">Invalid JSON</p>}
        </div>
      )}

      {viewMode === 'simulator' && (
        <SimulatorTab
          agent={agent}
          config={config}
          initialScript={sim.initialScript}
          eventType={sim.eventType}
          onEventTypeChange={sim.onEventTypeChange}
          commandValue={sim.commandValue}
          onCommandValueChange={sim.onCommandValueChange}
          payloadJSON={sim.payloadJSON}
          onPayloadJSONChange={sim.onPayloadJSONChange}
          customCommandText={sim.customCommandText}
          onCustomCommandTextChange={sim.onCustomCommandTextChange}
          onApply={sim.onApply}
          applying={sim.applying}
        />
      )}

      {saveError !== null && (
        <Alert className="border-destructive bg-[rgba(255,95,86,0.08)]">
          <AlertDescription className="text-[13px] text-destructive">{saveError}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export function HooksConfigPage() {
  const [activeAgent, setActiveAgent] = useState<AgentKey>(() => {
    const stored = readStorageString(AGENT_TAB_KEY)
    return stored === 'codex' ? 'codex' : 'claudecode'
  })
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = readStorageString(VIEW_MODE_KEY)
    return stored === 'json' || stored === 'simulator' ? stored : 'structured'
  })

  // Simulator cached state — lifted + sessionStorage so it survives page navigation
  const [simEventType, setSimEventType] = useState<string>(() => readSimCache()?.eventType ?? '')

  const [searchParams] = useSearchParams()
  const [initialScript, setInitialScript] = useState<string | undefined>(undefined)
  const deepLinkApplied = useRef(false)
  useEffect(() => {
    if (deepLinkApplied.current) return
    deepLinkApplied.current = true
    if (searchParams.get('view') === 'simulator') setViewMode('simulator')
    const ev = searchParams.get('event')
    if (ev) setSimEventType(ev)
    const sc = searchParams.get('script')
    if (sc) setInitialScript(sc)
  }, [searchParams])

  const [simCommandValue, setSimCommandValue] = useState<string>(
    () => readSimCache()?.commandValue ?? ''
  )
  const [simPayloadJSON, setSimPayloadJSON] = useState<string>(
    () => readSimCache()?.payloadJSON ?? ''
  )
  const [simCustomCommandText, setSimCustomCommandText] = useState<string>(
    () => readSimCache()?.customCommandText ?? ''
  )
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    try {
      sessionStorage.setItem(
        SIM_STORAGE_KEY,
        JSON.stringify({
          eventType: simEventType,
          commandValue: simCommandValue,
          payloadJSON: simPayloadJSON,
          customCommandText: simCustomCommandText,
        })
      )
    } catch {
      /* quota exceeded */
    }
  }, [simEventType, simCommandValue, simPayloadJSON, simCustomCommandText])

  const claudeState = useHooksConfig('claudecode')
  const codexState = useHooksConfig('codex')

  const activeState = activeAgent === 'claudecode' ? claudeState : codexState

  async function handleSimulatorApply(eventType: string, command: string) {
    const state = activeAgent === 'claudecode' ? claudeState : codexState
    const currentConfig = state.config ?? { hooks: {} }
    // Idempotent: command already wired for this event → nothing to add
    const exists = (currentConfig.hooks[eventType] ?? []).some((g) =>
      g.hooks.some((h) => h.command === command)
    )
    if (exists) return
    const newGroup: HookGroup = {
      id: crypto.randomUUID(),
      hooks: [{ id: crypto.randomUUID(), type: 'command', command } satisfies HookEntry],
    }
    const updatedConfig: HooksConfig = {
      ...currentConfig,
      hooks: {
        ...currentConfig.hooks,
        [eventType]: [...(currentConfig.hooks[eventType] ?? []), newGroup],
      },
    }
    // Update in-memory state immediately so Structured/JSON views reflect the change
    state.setConfig(updatedConfig)
    setApplying(true)
    try {
      // Save directly — can't use state.save() here due to stale draftJSON closure
      const body = JSON.stringify(updatedConfig, (k, v: unknown) => (k === 'id' ? undefined : v))
      const res = await fetch(`/api/hooks-config?agent=${activeAgent}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) {
        state.reload()
      }
    } finally {
      setApplying(false)
    }
  }

  const simProps: SimulatorCacheProps = {
    eventType: simEventType,
    onEventTypeChange: setSimEventType,
    commandValue: simCommandValue,
    onCommandValueChange: setSimCommandValue,
    payloadJSON: simPayloadJSON,
    onPayloadJSONChange: setSimPayloadJSON,
    customCommandText: simCustomCommandText,
    onCustomCommandTextChange: setSimCustomCommandText,
    onApply: handleSimulatorApply,
    applying,
    initialScript,
  }

  const jsonIsValid = (() => {
    try {
      JSON.parse(activeState.draftJSON)
      return true
    } catch {
      return false
    }
  })()

  const canSave = activeState.isDirty && jsonIsValid && !activeState.saving && !activeState.loading

  function handleViewModeChange(nextMode: string) {
    const mode = nextMode as ViewMode
    if (mode === viewMode) return
    if (mode === 'structured') {
      if (!jsonIsValid) return
      try {
        activeState.setConfig(JSON.parse(activeState.draftJSON) as HooksConfig)
      } catch {
        return
      }
    }
    setViewMode(mode)
    writeStorageString(VIEW_MODE_KEY, mode)
  }

  return (
    <PageShell>
      <PageHeader
        title="Hooks Config"
        subtitle={
          <a
            href={
              activeAgent === 'claudecode'
                ? 'https://code.claude.com/docs/en/hooks'
                : 'https://developers.openai.com/codex/hooks'
            }
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="size-3" />
            Hooks documentation
          </a>
        }
        actions={
          <>
            {viewMode !== 'simulator' && activeState.isDirty && !activeState.loading && (
              <span className="text-[12px] text-[var(--cwd)]">Unsaved changes</span>
            )}
            {viewMode !== 'simulator' &&
              !activeState.isDirty &&
              !activeState.loading &&
              activeState.error === null && (
                <span className="text-[12px] text-muted-foreground">Saved</span>
              )}
            {viewMode !== 'simulator' && (
              <Button
                variant="default"
                size="sm"
                onClick={() => void activeState.save()}
                disabled={!canSave}
                aria-label="Save hooks config"
              >
                {activeState.saving ? (
                  <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="size-3.5 mr-1.5" />
                )}
                Save
              </Button>
            )}
          </>
        }
      />

      <Tabs
        value={activeAgent}
        onValueChange={(v) => {
          const agent = v as AgentKey
          setActiveAgent(agent)
          writeStorageString(AGENT_TAB_KEY, agent)
        }}
        className="w-full"
      >
        <div className="flex items-center justify-between">
          <TabsList variant="line">
            <TabsTrigger value="claudecode">Claude Code</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
          </TabsList>
          <Tabs value={viewMode} onValueChange={handleViewModeChange}>
            <TabsList>
              <TabsTrigger
                value="structured"
                aria-label="Structured"
                disabled={viewMode === 'json' && !jsonIsValid}
                title={
                  viewMode === 'json' && !jsonIsValid
                    ? 'Fix JSON errors before switching to structured view'
                    : undefined
                }
              >
                <AppWindowIcon />
              </TabsTrigger>
              <TabsTrigger value="json" aria-label="JSON">
                <CodeIcon />
              </TabsTrigger>
              <TabsTrigger value="simulator" aria-label="Simulator">
                <Terminal />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <TabsContent value="claudecode">
          <AgentTabContent
            agent="claudecode"
            state={claudeState}
            viewMode={viewMode}
            sim={simProps}
          />
        </TabsContent>
        <TabsContent value="codex">
          <AgentTabContent agent="codex" state={codexState} viewMode={viewMode} sim={simProps} />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

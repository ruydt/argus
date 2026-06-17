import { useEffect, useRef, useState } from 'react'
import { AppWindowIcon, ExternalLink, RefreshCw, Save, Terminal } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, PageShell } from '@/components/shared/PageShell'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AnthropicLogo, OpenAILogo } from '@/agents/logos'
import { StructuredEditor } from './StructuredEditor'
import { SimulatorTab } from './SimulatorTab'
import { getTemplate } from './hookTemplates'
import { useHooksConfig } from './hooks/useHooksConfig'
import type { AgentKey, HookEntry, HookGroup, HooksConfig, HooksConfigState } from './types'

type ViewMode = 'structured' | 'simulator'

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
  const { config, loading, error, saveError, setConfig, reload } = state

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
    return stored === 'simulator' ? 'simulator' : 'structured'
  })

  // Simulator cached state — lifted + sessionStorage so it survives page navigation
  const [simEventType, setSimEventType] = useState<string>(() => readSimCache()?.eventType ?? '')

  const [searchParams] = useSearchParams()
  const [initialScript, setInitialScript] = useState<string | undefined>(undefined)
  const deepLinkApplied = useRef(false)
  useEffect(() => {
    if (deepLinkApplied.current) return
    deepLinkApplied.current = true
    // One-time deep-link application from URL params on first mount; the ref guard
    // ensures it runs once, so the sync setState can't cascade.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (searchParams.get('view') === 'simulator') setViewMode('simulator')
    const ev = searchParams.get('event')
    if (ev) {
      setSimEventType(ev)
      setSimPayloadJSON((current) => {
        if (current && current.trim()) return current
        const ag = readStorageString(AGENT_TAB_KEY) === 'codex' ? 'codex' : 'claudecode'
        return JSON.stringify(getTemplate(ag, ev), null, 2)
      })
    }
    const sc = searchParams.get('script')
    if (sc) setInitialScript(sc)
    /* eslint-enable react-hooks/set-state-in-effect */
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
          <Tabs value={viewMode} onValueChange={handleViewModeChange}>
            <TabsList variant="line">
              <TabsTrigger value="structured">
                <AppWindowIcon />
                Structured
              </TabsTrigger>
              <TabsTrigger value="simulator">
                <Terminal />
                Simulator
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Select
            value={activeAgent}
            onValueChange={(v) => {
              const agent = v as AgentKey
              setActiveAgent(agent)
              writeStorageString(AGENT_TAB_KEY, agent)
            }}
          >
            <SelectTrigger
              className="w-auto"
              aria-label="Agent"
              data-tour="hooks-config-agent-tabs"
            >
              {activeAgent === 'claudecode' ? (
                <AnthropicLogo size={18} />
              ) : (
                <OpenAILogo size={18} />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claudecode">
                <AnthropicLogo size={18} />
                Claude Code
              </SelectItem>
              <SelectItem value="codex">
                <OpenAILogo size={18} />
                Codex
              </SelectItem>
            </SelectContent>
          </Select>
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

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Plus, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, PageShell } from '@/components/shared/PageShell'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchSelect, type SearchSelectOption } from '@/components/shared/SearchSelect'
import { AgentLogo, agentMeta } from '@/agents/catalog'
import { StructuredEditor } from './StructuredEditor'
import { SimulatorTab } from './SimulatorTab'
import { GuidedSetupPanel } from './GuidedSetupPanel'
import { getTemplate } from './hookTemplates'
import { useHooksConfig } from './hooks/useHooksConfig'
import { useAgents, type AgentStatus } from './hooks/useAgents'
import { SIM_PAYLOAD_HANDOFF_KEY } from './simHandoff'
import type { AgentKey, HookEntry, HookGroup, HooksConfig, HooksConfigState } from './types'

type ViewMode = 'structured' | 'simulator'

const SIM_STORAGE_KEY = 'argus:sim'
const AGENT_TAB_KEY = 'argus:hooks-agent'
const VIEW_MODE_KEY = 'argus:hooks-view'

// The two original agents always show a tab and are never removable in the UI.
const CORE_AGENTS = ['claudecode', 'codex']

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

// readSimHandoff pops the one-shot "Simulate this event" payload (set by the
// event modal) so it's applied exactly once and doesn't stick across visits.
function readSimHandoff(): string | null {
  try {
    const v = sessionStorage.getItem(SIM_PAYLOAD_HANDOFF_KEY)
    if (v) sessionStorage.removeItem(SIM_PAYLOAD_HANDOFF_KEY)
    return v && v.trim() ? v : null
  } catch {
    return null
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
  status?: AgentStatus
  state: HooksConfigState
  viewMode: ViewMode
  sim: SimulatorCacheProps
}

function AgentTabContent({ agent, status, state, viewMode, sim }: AgentTabContentProps) {
  const { config, loading, error, saveError, setConfig, reload } = state

  const jsonIsValid = (() => {
    try {
      JSON.parse(state.draftJSON)
      return true
    } catch {
      return false
    }
  })()
  const canSave = state.isDirty && jsonIsValid && !state.saving && !loading

  if (loading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
      </div>
    )
  }

  if (error !== null) {
    return (
      <Card className="p-6 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-foreground">Failed to load hooks config</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={reload}>
          Retry
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {viewMode === 'structured' && config !== null && (
        <div className="animate-in fade-in duration-200">
          <StructuredEditor
            config={config}
            agent={agent}
            events={status?.events}
            supportsMatcher={status?.supports_matcher ?? true}
            timeoutUnit={status?.timeout_unit ?? 'seconds'}
            isDirty={state.isDirty}
            onDiscardChanges={state.discardChanges}
            onChange={setConfig}
            onSave={(cfg) => void state.save(cfg)}
            saving={state.saving}
            canSave={canSave}
          />
        </div>
      )}

      {viewMode === 'simulator' && (
        <div className="animate-in fade-in slide-in-from-left-8 duration-300">
          <SimulatorTab
            agent={agent}
            config={config}
            events={status?.events}
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
        </div>
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
  const { agents, enabled, enableAgent, disableAgent, loading: agentsLoading } = useAgents()

  const [storedAgent, setStoredAgent] = useState<string>(
    () => readStorageString(AGENT_TAB_KEY) ?? 'claudecode'
  )
  // The effective agent is always one of the enabled tabs: fall back to the
  // first enabled agent when the stored one was removed or isn't enabled.
  const activeAgent = enabled.includes(storedAgent) ? storedAgent : (enabled[0] ?? 'claudecode')

  const activeStatus = agents.find((a) => a.id === activeAgent)
  // Treat the two core agents as editable even before /api/agents resolves so
  // the page works identically to before during the initial fetch.
  const activeEditable = activeStatus
    ? activeStatus.editing_supported
    : CORE_AGENTS.includes(activeAgent)

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = readStorageString(VIEW_MODE_KEY)
    return stored === 'simulator' ? 'simulator' : 'structured'
  })

  // Simulator cached state — lifted + sessionStorage so it survives navigation.
  const [simEventType, setSimEventType] = useState<string>(() => readSimCache()?.eventType ?? '')

  const [searchParams] = useSearchParams()
  const [initialScript, setInitialScript] = useState<string | undefined>(undefined)

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

  // Only the active agent's config is loaded, and only when it's editable and
  // there's actually an agent tab (none ⇒ empty state, no fetch).
  const state = useHooksConfig(activeAgent, activeEditable && enabled.length > 0)

  useEffect(() => {
    // Apply deep-link params whenever they change. Re-applies (not one-shot) so
    // the page tour can drive the view by navigating to ?view=simulator&event=…
    /* eslint-disable react-hooks/set-state-in-effect */
    if (searchParams.get('view') === 'simulator') setViewMode('simulator')
    const ev = searchParams.get('event')
    // "Simulate this event" hands a real payload via sessionStorage; consume it
    // (once) so the simulator opens with the exact event JSON, not a template.
    const handoff = searchParams.get('payload') === '1' ? readSimHandoff() : null
    if (ev) {
      setSimEventType(ev)
      setSimPayloadJSON((current) => {
        if (handoff) return handoff
        if (current && current.trim()) return current
        const ag = readStorageString(AGENT_TAB_KEY) === 'codex' ? 'codex' : 'claudecode'
        return JSON.stringify(getTemplate(ag, ev), null, 2)
      })
    } else if (handoff) {
      setSimPayloadJSON(handoff)
    }
    const sc = searchParams.get('script')
    if (sc) setInitialScript(sc)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [searchParams])

  // The onboarding tour adds an agent for the user: enable + select it so the
  // hooks tab (and its preset selector) appear without manual interaction.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id
      if (!id) return
      if (!enabled.includes(id)) void enableAgent(id)
      setStoredAgent(id)
      writeStorageString(AGENT_TAB_KEY, id)
    }
    window.addEventListener('argus:tour-add-agent', handler)
    return () => window.removeEventListener('argus:tour-add-agent', handler)
  }, [enabled, enableAgent])

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

  async function handleSimulatorApply(eventType: string, command: string) {
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
    state.setConfig(updatedConfig)
    setApplying(true)
    try {
      const body = JSON.stringify(updatedConfig, (k, v: unknown) => (k === 'id' ? undefined : v))
      const res = await fetch(`/api/hooks-config?agent=${activeAgent}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (!res.ok) {
        throw new Error(await res.text().catch(() => `HTTP ${res.status}`))
      }
      // Sync the saved baseline in place. reload() would flip loading→true and
      // remount the simulator tab (killing the Apply success tick); commitSaved
      // adopts the persisted config without a refetch.
      const saved = (await res.json().catch(() => updatedConfig)) as HooksConfig
      state.commitSaved(saved)
    } catch (err) {
      state.setConfig(currentConfig)
      throw err
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

  function selectAgent(id: string) {
    setStoredAgent(id)
    writeStorageString(AGENT_TAB_KEY, id)
  }

  function handleViewModeChange(nextMode: string) {
    const mode = nextMode as ViewMode
    if (mode === viewMode) return
    setViewMode(mode)
    writeStorageString(VIEW_MODE_KEY, mode)
  }

  async function handleAddAgent(id: string) {
    try {
      await enableAgent(id)
      selectAgent(id)
    } catch {
      /* enabling failed (e.g. race) — agent simply isn't added */
    }
  }

  async function handleRemoveAgent(id: string) {
    try {
      await disableAgent(id)
      if (storedAgent === id) selectAgent(enabled.find((e) => e !== id) ?? 'claudecode')
    } catch {
      /* removal failed — tab stays */
    }
  }

  // Agents available to add: every known agent not already a tab. Installed
  // ones are selectable; not-installed ones stay visible but disabled.
  const addableOptions: SearchSelectOption[] = useMemo(
    () =>
      agents
        .filter((a) => !enabled.includes(a.id))
        .sort((a, b) => Number(b.installed) - Number(a.installed))
        .map((a) => ({
          value: a.id,
          label: agentMeta(a.id).label,
          icon: <AgentLogo id={a.id} size={20} />,
          disabled: !a.installed,
          hint: a.installed ? undefined : 'not installed',
        })),
    [agents, enabled]
  )

  const docsUrl =
    activeStatus?.docs_url ??
    (activeAgent === 'claudecode'
      ? 'https://code.claude.com/docs/en/hooks'
      : activeAgent === 'codex'
        ? 'https://developers.openai.com/codex/hooks'
        : '')

  return (
    <PageShell>
      <PageHeader
        title="Hooks"
        subtitle={
          docsUrl ? (
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="size-3" />
              Hooks documentation
            </a>
          ) : undefined
        }
      />

      {agentsLoading ? (
        // Wait for /api/agents before rendering tabs so we never flash the
        // claudecode/codex defaults that then vanish once the real enabled set
        // resolves.
        <div className="flex w-full gap-6" aria-busy="true">
          <div className="flex w-40 shrink-0 flex-col gap-2">
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
          <Skeleton className="h-40 flex-1 rounded-lg" />
        </div>
      ) : (
        <Tabs
          orientation="vertical"
          value={activeAgent}
          onValueChange={selectAgent}
          className="w-full gap-6"
        >
          <div className="flex w-40 shrink-0 flex-col gap-2">
            <TabsList
              variant="line"
              className="w-full border-r border-border/60 p-0 pr-1"
              data-tour="hooks-config-agent-tabs"
            >
              {enabled.map((id) => (
                <div key={id} className="group/agent relative w-full">
                  <TabsTrigger value={id} className="w-full justify-start gap-2 pr-7">
                    <AgentLogo id={id} size={22} />
                    {agentMeta(id).label}
                  </TabsTrigger>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleRemoveAgent(id)
                    }}
                    className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded danger-action opacity-0 transition-opacity pointer-events-none group-hover/agent:pointer-events-auto group-hover/agent:opacity-100"
                    aria-label={`Remove ${agentMeta(id).label}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </TabsList>

            <SearchSelect
              options={addableOptions}
              onSelect={handleAddAgent}
              placeholder="Search agents…"
              emptyText="No agents to add."
              trigger={
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                  aria-label="Add agent"
                  data-tour="hooks-config-add-agent"
                >
                  <Plus className="size-4" />
                  Add agent
                </button>
              }
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {enabled.length === 0 ? (
              <Card className="flex flex-col items-center gap-2 p-8 text-center">
                <p className="text-sm font-medium text-foreground">No agents added</p>
                <p className="max-w-sm text-[13px] text-muted-foreground">
                  Use “Add agent” to pick an installed coding agent and manage its hooks.
                </p>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <AgentLogo id={activeAgent} size={28} />
                    <span className="truncate text-[15px] font-semibold text-foreground">
                      {agentMeta(activeAgent).label}
                    </span>
                  </div>
                  {activeEditable &&
                    (viewMode === 'simulator' ? (
                      <button
                        type="button"
                        onClick={() => handleViewModeChange('structured')}
                        className="group flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Back to Structured"
                      >
                        <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
                        Go back
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleViewModeChange('simulator')}
                        className="group flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Open Simulator"
                      >
                        Simulator
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    ))}
                </div>

                <TabsContent value={activeAgent}>
                  {activeEditable ? (
                    <AgentTabContent
                      agent={activeAgent}
                      status={activeStatus}
                      state={state}
                      viewMode={viewMode}
                      sim={simProps}
                    />
                  ) : activeStatus ? (
                    <GuidedSetupPanel agent={activeStatus} />
                  ) : (
                    <GuidedSetupPanel agent={fallbackStatus(activeAgent)} />
                  )}
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      )}
    </PageShell>
  )
}

// fallbackStatus builds a minimal AgentStatus when /api/agents hasn't resolved
// but a non-core agent is somehow active — keeps the guided panel renderable.
function fallbackStatus(id: string): AgentStatus {
  return {
    id,
    display_name: agentMeta(id).label,
    docs_url: '',
    config_kind: 'unknown',
    hooks_config_path: '',
    editing_supported: false,
    installed: false,
    hooks_configured: false,
  }
}

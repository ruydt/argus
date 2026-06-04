import { useState } from 'react'
import { json } from '@codemirror/lang-json'
import CodeMirror from '@uiw/react-codemirror'
import { AppWindowIcon, Check, CodeIcon, Copy, ExternalLink, RefreshCw, Save } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { hookerEditorTheme, hookerHighlighting, editableExtensions } from '@/lib/editorTheme'
import { StructuredEditor } from './StructuredEditor'
import { useHooksConfig } from './hooks/useHooksConfig'
import type { AgentKey, HooksConfig, HooksConfigState } from './types'

type ViewMode = 'structured' | 'json'

type AgentTabContentProps = {
  agent: AgentKey
  state: HooksConfigState
  viewMode: ViewMode
}

function AgentTabContent({ agent, state, viewMode }: AgentTabContentProps) {
  const [copied, setCopied] = useState(false)
  const { config, draftJSON, loading, error, saveError, setDraftJSON, setConfig, reload } = state

  function handleCopy() {
    void navigator.clipboard.writeText(draftJSON).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

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
        <StructuredEditor config={config} agent={agent} onChange={setConfig} />
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
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 z-10 flex items-center justify-center size-7 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/10 transition-colors"
              aria-label="Copy JSON"
              title="Copy JSON"
            >
              {copied ? (
                <Check className="size-3.5 text-green-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
            <CodeMirror
              value={draftJSON}
              onChange={(value) => setDraftJSON(value)}
              extensions={[json(), hookerEditorTheme, hookerHighlighting, ...editableExtensions]}
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

      {saveError !== null && (
        <Alert className="border-destructive bg-[rgba(255,95,86,0.08)]">
          <AlertDescription className="text-[13px] text-destructive">{saveError}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export function HooksConfigPage() {
  const [activeAgent, setActiveAgent] = useState<AgentKey>('claudecode')
  const [viewMode, setViewMode] = useState<ViewMode>('structured')

  const claudeState = useHooksConfig('claudecode')
  const codexState = useHooksConfig('codex')

  const activeState = activeAgent === 'claudecode' ? claudeState : codexState

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
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[22px] font-semibold text-foreground">Hooks Config</h1>
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
          </div>
          <div className="flex items-center gap-2">
            {activeState.isDirty && !activeState.loading && (
              <span className="text-[12px] text-[var(--cwd)]">Unsaved changes</span>
            )}
            {!activeState.isDirty && !activeState.loading && activeState.error === null && (
              <span className="text-[12px] text-muted-foreground">Saved</span>
            )}
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
          </div>
        </div>

        <Tabs
          value={activeAgent}
          onValueChange={(v) => setActiveAgent(v as AgentKey)}
          className="w-full"
        >
          <div className="flex items-center justify-between">
            <TabsList>
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
              </TabsList>
            </Tabs>
          </div>
          <TabsContent value="claudecode">
            <AgentTabContent agent="claudecode" state={claudeState} viewMode={viewMode} />
          </TabsContent>
          <TabsContent value="codex">
            <AgentTabContent agent="codex" state={codexState} viewMode={viewMode} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

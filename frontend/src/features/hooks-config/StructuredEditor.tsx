import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import type { SearchableSelectOption } from '@/components/shared/SearchableSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  HOOK_PRESETS,
  ARGUS_STATUS_MESSAGE,
  PRESET_KEYS,
  PRESET_LABELS,
  applyPreset,
  hasAnyArgusHooks,
  removeArgusHooks,
} from './presets'
import type { AgentKey, HookEntry, HookGroup, HooksConfig } from './types'

// Tool names that support matcher filtering
const TOOL_EVENTS = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
])

const TOOL_MATCHERS: SearchableSelectOption[] = [
  { label: 'All tools (match all)', value: '' },
  { label: 'Bash', value: 'Bash' },
  { label: 'Read', value: 'Read' },
  { label: 'Write', value: 'Write' },
  { label: 'Edit', value: 'Edit' },
  { label: 'Glob', value: 'Glob' },
  { label: 'Grep', value: 'Grep' },
  { label: 'Notebook', value: 'Notebook' },
  { label: 'mcp__.* (all MCP tools)', value: 'mcp__.*' },
]

const EVENT_MATCHERS: Record<string, SearchableSelectOption[]> = {
  SessionStart: [
    { label: 'All (match all)', value: '' },
    { label: 'startup', value: 'startup' },
    { label: 'resume', value: 'resume' },
    { label: 'clear', value: 'clear' },
    { label: 'compact', value: 'compact' },
  ],
  SessionEnd: [
    { label: 'All (match all)', value: '' },
    { label: 'clear', value: 'clear' },
    { label: 'resume', value: 'resume' },
    { label: 'logout', value: 'logout' },
    { label: 'prompt_input_exit', value: 'prompt_input_exit' },
    { label: 'bypass_permissions_disabled', value: 'bypass_permissions_disabled' },
    { label: 'other', value: 'other' },
  ],
  Setup: [
    { label: 'All (match all)', value: '' },
    { label: 'init', value: 'init' },
    { label: 'maintenance', value: 'maintenance' },
  ],
  StopFailure: [
    { label: 'All (match all)', value: '' },
    { label: 'rate_limit', value: 'rate_limit' },
    { label: 'overloaded', value: 'overloaded' },
    { label: 'authentication_failed', value: 'authentication_failed' },
    { label: 'billing_error', value: 'billing_error' },
    { label: 'invalid_request', value: 'invalid_request' },
    { label: 'model_not_found', value: 'model_not_found' },
    { label: 'server_error', value: 'server_error' },
    { label: 'max_output_tokens', value: 'max_output_tokens' },
    { label: 'unknown', value: 'unknown' },
  ],
  PreCompact: [
    { label: 'All (match all)', value: '' },
    { label: 'manual', value: 'manual' },
    { label: 'auto', value: 'auto' },
  ],
  PostCompact: [
    { label: 'All (match all)', value: '' },
    { label: 'manual', value: 'manual' },
    { label: 'auto', value: 'auto' },
  ],
  Notification: [
    { label: 'All (match all)', value: '' },
    { label: 'permission_prompt', value: 'permission_prompt' },
    { label: 'idle_prompt', value: 'idle_prompt' },
    { label: 'auth_success', value: 'auth_success' },
    { label: 'elicitation_dialog', value: 'elicitation_dialog' },
    { label: 'elicitation_complete', value: 'elicitation_complete' },
    { label: 'elicitation_response', value: 'elicitation_response' },
  ],
  SubagentStart: [
    { label: 'All (match all)', value: '' },
    { label: 'general-purpose', value: 'general-purpose' },
    { label: 'Explore', value: 'Explore' },
    { label: 'Plan', value: 'Plan' },
  ],
  SubagentStop: [
    { label: 'All (match all)', value: '' },
    { label: 'general-purpose', value: 'general-purpose' },
    { label: 'Explore', value: 'Explore' },
    { label: 'Plan', value: 'Plan' },
  ],
  ConfigChange: [
    { label: 'All (match all)', value: '' },
    { label: 'user_settings', value: 'user_settings' },
    { label: 'project_settings', value: 'project_settings' },
    { label: 'local_settings', value: 'local_settings' },
    { label: 'policy_settings', value: 'policy_settings' },
    { label: 'skills', value: 'skills' },
  ],
  InstructionsLoaded: [
    { label: 'All (match all)', value: '' },
    { label: 'session_start', value: 'session_start' },
    { label: 'nested_traversal', value: 'nested_traversal' },
    { label: 'path_glob_match', value: 'path_glob_match' },
    { label: 'include', value: 'include' },
    { label: 'compact', value: 'compact' },
  ],
}

function getMatcherOptions(eventType: string): SearchableSelectOption[] {
  if (TOOL_EVENTS.has(eventType)) return TOOL_MATCHERS
  return EVENT_MATCHERS[eventType] ?? [{ label: 'Match all', value: '' }]
}

const SCRIPT_RUNNERS: Record<string, string> = { '.js': 'node', '.sh': 'sh', '.py': 'python3' }

type HookScript = { name: string; path: string }

function scriptExt(name: string) {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i)
}

function composeCmd(script: HookScript, agent: AgentKey): string {
  const runner = SCRIPT_RUNNERS[scriptExt(script.name)] ?? 'node'
  const base = `${runner} "${script.path}"`
  return agent === 'claudecode' ? `CLAUDECODE=1 ${base}` : base
}

const CLAUDE_EVENT_TYPES = [
  // Session lifecycle
  'SessionStart',
  'Setup',
  'SessionEnd',
  // Per-turn
  'UserPromptSubmit',
  'UserPromptExpansion',
  'Stop',
  'StopFailure',
  // Agentic loop
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'PermissionRequest',
  'PermissionDenied',
  // Subagent & task
  'SubagentStart',
  'SubagentStop',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  // File & config
  'FileChanged',
  'CwdChanged',
  'ConfigChange',
  'InstructionsLoaded',
  // Context & display
  'MessageDisplay',
  'Notification',
  // Compaction
  'PreCompact',
  'PostCompact',
  // Worktree
  'WorktreeCreate',
  'WorktreeRemove',
  // MCP elicitation
  'Elicitation',
  'ElicitationResult',
]

const CODEX_EVENT_TYPES = [
  'SessionStart',
  'SubagentStart',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'UserPromptSubmit',
  'SubagentStop',
  'Stop',
]

function emptyEntry(): HookEntry {
  return {
    id: crypto.randomUUID(),
    type: 'command',
    command:
      "curl -s --max-time 2 -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @- || true",
    statusMessage: ARGUS_STATUS_MESSAGE,
  }
}

function emptyGroup(): HookGroup {
  return { id: crypto.randomUUID(), hooks: [emptyEntry()] }
}

type StructuredEditorProps = {
  config: HooksConfig
  agent: AgentKey
  isDirty: boolean
  onDiscardChanges: () => void
  onChange: (config: HooksConfig) => void
}

export function StructuredEditor({
  config,
  agent,
  isDirty,
  onDiscardChanges,
  onChange,
}: StructuredEditorProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [hookScripts, setHookScripts] = useState<HookScript[]>([])
  const [editingEntry, setEditingEntry] = useState<{
    key: string
    draft: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/diagnostics')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { fileSystem?: { hooks?: HookScript[] } } | null) => {
        if (cancelled || !data?.fileSystem?.hooks) return
        setHookScripts(data.fileSystem.hooks.filter((h) => scriptExt(h.name) in SCRIPT_RUNNERS))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const knownEvents = agent === 'claudecode' ? CLAUDE_EVENT_TYPES : CODEX_EVENT_TYPES
  const usedEvents = Object.keys(config.hooks)
  const availableToAdd = knownEvents.filter((e) => !usedEvents.includes(e))

  function toggleCollapse(eventType: string) {
    setCollapsed((prev) => ({ ...prev, [eventType]: !(prev[eventType] ?? true) }))
  }

  const setEventGroups = (eventType: string, groups: HookGroup[]) =>
    onChange({ hooks: { ...config.hooks, [eventType]: groups } })

  function removeEventType(eventType: string) {
    const next = { ...config.hooks }
    delete next[eventType]
    onChange({ hooks: next })
  }

  function addEventType(eventType: string) {
    setCollapsed((prev) => ({ ...prev, [eventType]: false }))
    onChange({ hooks: { ...config.hooks, [eventType]: [emptyGroup()] } })
  }

  function handleApplyPreset(key: string) {
    setSelectedPreset(key)
    const preset = HOOK_PRESETS[agent][key as keyof (typeof HOOK_PRESETS)[typeof agent]]
    onChange(applyPreset(config, preset))
  }

  function handleRemoveArgusHooks() {
    onChange(removeArgusHooks(config))
  }

  function addGroup(eventType: string) {
    setEventGroups(eventType, [...(config.hooks[eventType] ?? []), emptyGroup()])
  }

  function removeGroup(eventType: string, groupIdx: number) {
    const groups = [...(config.hooks[eventType] ?? [])]
    groups.splice(groupIdx, 1)
    if (groups.length === 0) {
      removeEventType(eventType)
    } else {
      setEventGroups(eventType, groups)
    }
  }

  function patchGroup(eventType: string, groupIdx: number, patch: Partial<HookGroup>) {
    const groups = [...(config.hooks[eventType] ?? [])]
    groups[groupIdx] = { ...groups[groupIdx], ...patch }
    setEventGroups(eventType, groups)
  }

  function addEntry(eventType: string, groupIdx: number) {
    const groups = [...(config.hooks[eventType] ?? [])]
    groups[groupIdx] = { ...groups[groupIdx], hooks: [...groups[groupIdx].hooks, emptyEntry()] }
    setEventGroups(eventType, groups)
  }

  function removeEntry(eventType: string, groupIdx: number, entryIdx: number) {
    const groups = [...(config.hooks[eventType] ?? [])]
    const hooks = [...groups[groupIdx].hooks]
    hooks.splice(entryIdx, 1)
    groups[groupIdx] = { ...groups[groupIdx], hooks }
    setEventGroups(eventType, groups)
  }

  function patchEntry(
    eventType: string,
    groupIdx: number,
    entryIdx: number,
    patch: Partial<HookEntry>
  ) {
    const groups = [...(config.hooks[eventType] ?? [])]
    const hooks = [...groups[groupIdx].hooks]
    hooks[entryIdx] = { ...hooks[entryIdx], ...patch }
    groups[groupIdx] = { ...groups[groupIdx], hooks }
    setEventGroups(eventType, groups)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap" data-tour="hooks-structured-toolbar">
        {availableToAdd.length > 0 && (
          <SearchableSelect
            key={usedEvents.join(',')}
            value=""
            onValueChange={addEventType}
            options={availableToAdd.map((e) => ({ label: e, value: e }))}
            placeholder="Add hook event"
            ariaLabel="Add hook event"
            className="h-8 w-[200px] text-[13px] font-mono bg-transparent border-input text-foreground"
          />
        )}

        <Select value={selectedPreset} onValueChange={handleApplyPreset}>
          <SelectTrigger className="h-8 text-[13px] w-[160px]" data-tour="preset-selector">
            <span className={selectedPreset ? 'text-[13px]' : 'text-[13px] text-muted-foreground'}>
              {selectedPreset
                ? PRESET_LABELS[selectedPreset as keyof typeof PRESET_LABELS]?.label
                : 'Apply preset…'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {PRESET_KEYS.map((key) => (
              <SelectItem key={key} value={key} className="text-[13px]">
                <span className="font-medium">{PRESET_LABELS[key].label}</span>
                <span className="ml-1.5 text-muted-foreground text-[12px]">
                  — overwrites current config with {PRESET_LABELS[key].description}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <TooltipProvider delayDuration={100}>
          <div className="flex items-center gap-1 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground"
                  disabled={!isDirty}
                  onClick={onDiscardChanges}
                  aria-label="Discard changes"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Discard changes</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  disabled={!hasAnyArgusHooks(config)}
                  onClick={handleRemoveArgusHooks}
                  aria-label="Remove Argus hooks"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove Argus hooks</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {usedEvents.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          No hooks configured. Use the selectors above to add events or apply a preset.
        </p>
      )}

      {usedEvents.map((eventType, eventIdx) => {
        const groups = config.hooks[eventType] ?? []
        const hookCount = groups.reduce((n, g) => n + g.hooks.length, 0)
        const isCollapsed = collapsed[eventType] ?? true

        return (
          <div
            key={eventType}
            className="border border-border rounded-lg overflow-hidden"
            data-tour={eventIdx === 0 ? 'hooks-event-group' : undefined}
          >
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 bg-secondary/40 hover:bg-secondary/60 transition-colors text-left"
              onClick={() => toggleCollapse(eventType)}
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? (
                  <ChevronRight className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
                <span className="text-[13px] font-medium">{eventType}</span>
                <Badge variant="outline" className="text-[11px]">
                  {hookCount} {hookCount !== 1 ? 'hooks' : 'hook'}
                </Badge>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${eventType}`}
                onClick={(e) => {
                  e.stopPropagation()
                  removeEventType(eventType)
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </button>

            {!isCollapsed && (
              <div className="flex flex-col gap-3 p-4">
                {groups.map((group, groupIdx) => (
                  <div
                    key={group.id}
                    className="border border-border/60 rounded-md p-3 flex flex-col gap-2 bg-background"
                  >
                    {/* Group header: matcher (compact) + delete */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground shrink-0">Matcher</span>
                      <SearchableSelect
                        value={group.matcher ?? ''}
                        onValueChange={(v) =>
                          patchGroup(eventType, groupIdx, { matcher: v || undefined })
                        }
                        options={getMatcherOptions(eventType)}
                        placeholder="match all"
                        ariaLabel="Matcher"
                        creatable
                        className="h-6 text-[12px] font-mono flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        aria-label="Remove group"
                        onClick={() => removeGroup(eventType, groupIdx)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>

                    {/* Hook entries: command only, extras in popover */}
                    {group.hooks.map((entry, entryIdx) => {
                      const scriptOptions: SearchableSelectOption[] = hookScripts.map((s) => ({
                        label: s.name,
                        value: composeCmd(s, agent),
                      }))
                      const editKey = `${eventType}-${groupIdx}-${entryIdx}`
                      const isEditing = editingEntry?.key === editKey
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center gap-1.5 pl-4 border-l border-border/40"
                        >
                          <SearchableSelect
                            value={entry.command}
                            onValueChange={(v) =>
                              patchEntry(eventType, groupIdx, entryIdx, { command: v })
                            }
                            options={scriptOptions}
                            placeholder="curl -s -X POST http://127.0.0.1:10804/api/hook ..."
                            ariaLabel="Command"
                            creatable
                            className="h-7 text-[13px] font-mono flex-1"
                          />
                          <Popover
                            open={isEditing}
                            onOpenChange={(open) => {
                              if (open) {
                                setEditingEntry({ key: editKey, draft: entry.command })
                              } else {
                                setEditingEntry(null)
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-foreground shrink-0"
                                aria-label="Edit command"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[520px] p-3" align="end">
                              <div className="flex flex-col gap-2">
                                <span className="text-[11px] text-muted-foreground">
                                  Edit command
                                </span>
                                <textarea
                                  value={editingEntry?.draft ?? ''}
                                  onChange={(e) =>
                                    setEditingEntry((prev) =>
                                      prev ? { ...prev, draft: e.target.value } : prev
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                      patchEntry(eventType, groupIdx, entryIdx, {
                                        command: editingEntry?.draft.trim() ?? '',
                                      })
                                      setEditingEntry(null)
                                    }
                                  }}
                                  rows={4}
                                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                                  autoFocus
                                />
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-muted-foreground">
                                    ⌘↵ to apply
                                  </span>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingEntry(null)}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={!editingEntry?.draft.trim()}
                                      onClick={() => {
                                        patchEntry(eventType, groupIdx, entryIdx, {
                                          command: editingEntry?.draft.trim() ?? '',
                                        })
                                        setEditingEntry(null)
                                      }}
                                    >
                                      Apply
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-foreground shrink-0"
                                aria-label="Hook options"
                              >
                                <SlidersHorizontal className="size-3.5" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-3" align="end">
                              <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-1">
                                  <span className="text-[11px] text-muted-foreground">
                                    Timeout (s)
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={entry.timeout ?? ''}
                                    onChange={(e) =>
                                      patchEntry(eventType, groupIdx, entryIdx, {
                                        timeout: e.target.value
                                          ? Number(e.target.value)
                                          : undefined,
                                      })
                                    }
                                    placeholder="5"
                                    className="h-7 text-[13px]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[11px] text-muted-foreground">
                                    Status message
                                  </span>
                                  <Input
                                    value={entry.statusMessage ?? ''}
                                    onChange={(e) =>
                                      patchEntry(eventType, groupIdx, entryIdx, {
                                        statusMessage: e.target.value || undefined,
                                      })
                                    }
                                    placeholder="Loading..."
                                    className="h-7 text-[13px]"
                                  />
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            aria-label="Remove hook"
                            onClick={() => removeEntry(eventType, groupIdx, entryIdx)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )
                    })}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start text-[12px] h-7 pl-4 text-muted-foreground hover:text-foreground"
                      onClick={() => addEntry(eventType, groupIdx)}
                    >
                      <Plus className="size-3.5 mr-1" />
                      Add hook
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start text-[12px] h-7"
                  onClick={() => addGroup(eventType)}
                >
                  <Plus className="size-3.5 mr-1" />
                  Add group
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AgentKey, HookEntry, HookGroup, HooksConfig } from './types'

const CLAUDE_EVENT_TYPES = [
  'SessionStart',
  'Setup',
  'SessionEnd',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'PreToolUse',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'Stop',
  'SubagentStop',
]

const CODEX_EVENT_TYPES = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'PreCompact',
  'PostCompact',
]

function emptyEntry(): HookEntry {
  return { type: 'command', command: '' }
}

function emptyGroup(): HookGroup {
  return { hooks: [emptyEntry()] }
}

type StructuredEditorProps = {
  config: HooksConfig
  agent: AgentKey
  onChange: (config: HooksConfig) => void
}

export function StructuredEditor({ config, agent, onChange }: StructuredEditorProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const knownEvents = agent === 'claudecode' ? CLAUDE_EVENT_TYPES : CODEX_EVENT_TYPES
  const usedEvents = Object.keys(config.hooks)
  const availableToAdd = knownEvents.filter((e) => !usedEvents.includes(e))

  function toggleCollapse(eventType: string) {
    setCollapsed((prev) => ({ ...prev, [eventType]: !(prev[eventType] ?? true) }))
  }

  function setEventGroups(eventType: string, groups: HookGroup[]) {
    onChange({ hooks: { ...config.hooks, [eventType]: groups } })
  }

  function removeEventType(eventType: string) {
    const next = { ...config.hooks }
    delete next[eventType]
    onChange({ hooks: next })
  }

  function addEventType(eventType: string) {
    onChange({ hooks: { ...config.hooks, [eventType]: [emptyGroup()] } })
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
      {usedEvents.map((eventType) => {
        const groups = config.hooks[eventType] ?? []
        const hookCount = groups.reduce((n, g) => n + g.hooks.length, 0)
        const isCollapsed = collapsed[eventType] ?? true

        return (
          <div key={eventType} className="border border-border rounded-lg overflow-hidden">
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
                <span className="font-mono text-[13px] font-medium">{eventType}</span>
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
                    key={groupIdx}
                    className="border border-border/60 rounded-md p-3 flex flex-col gap-2 bg-background"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-muted-foreground w-20 shrink-0">
                        Matcher
                      </span>
                      <Input
                        value={group.matcher ?? ''}
                        onChange={(e) =>
                          patchGroup(eventType, groupIdx, {
                            matcher: e.target.value || undefined,
                          })
                        }
                        placeholder=".*  (empty = match all)"
                        className="h-7 text-[13px] font-mono flex-1"
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

                    {group.hooks.map((entry, entryIdx) => (
                      <div
                        key={entryIdx}
                        className="flex flex-col gap-1.5 pl-4 border-l border-border/40"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-muted-foreground w-20 shrink-0">
                            Command
                          </span>
                          <Input
                            value={entry.command}
                            onChange={(e) =>
                              patchEntry(eventType, groupIdx, entryIdx, { command: e.target.value })
                            }
                            placeholder="curl -s -X POST http://127.0.0.1:8765/api/hook ..."
                            className="h-7 text-[13px] font-mono flex-1"
                          />
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
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-muted-foreground w-20 shrink-0">
                            Timeout (s)
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={entry.timeout ?? ''}
                            onChange={(e) =>
                              patchEntry(eventType, groupIdx, entryIdx, {
                                timeout: e.target.value ? Number(e.target.value) : undefined,
                              })
                            }
                            placeholder="5"
                            className="h-7 text-[13px] w-20"
                          />
                          <span className="text-[12px] text-muted-foreground w-24 shrink-0 ml-2">
                            Status msg
                          </span>
                          <Input
                            value={entry.statusMessage ?? ''}
                            onChange={(e) =>
                              patchEntry(eventType, groupIdx, entryIdx, {
                                statusMessage: e.target.value || undefined,
                              })
                            }
                            placeholder="Loading..."
                            className="h-7 text-[13px] flex-1"
                          />
                        </div>
                      </div>
                    ))}

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

      {availableToAdd.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Select onValueChange={addEventType}>
            <SelectTrigger className="h-8 text-[13px] w-[220px]">
              <SelectValue placeholder="Add event type..." />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map((e) => (
                <SelectItem key={e} value={e} className="font-mono text-[13px]">
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {usedEvents.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          No hooks configured. Use the selector above to add an event type.
        </p>
      )}
    </div>
  )
}

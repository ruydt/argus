import { useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Database, HardDrive, RefreshCw, Zap } from 'lucide-react'
import { CopyIconButton } from '@/components/shared/CopyIconButton'
import { PageHeader, PageShell } from '@/components/shared/PageShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { detectHookConfigLabel } from '@/features/hooks-config/presets'
import type { HooksConfig } from '@/features/hooks-config/types'
import type { AgentKey } from '@/features/hooks-config/types'
import { useDiagnostics } from './hooks/useDiagnostics'
import type { Diagnostics, DiagnosticsAgent } from './types'
import { formatBytes } from './utils'

const PRESET_AGENT_IDS = new Set<string>(['claudecode', 'codex'])

async function fetchHookConfigLabel(agentId: string): Promise<[string, string]> {
  try {
    const r = await fetch(`/api/hooks-config?agent=${agentId}`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const config = (await r.json()) as HooksConfig
    return [agentId, detectHookConfigLabel(agentId as AgentKey, config)]
  } catch {
    return [agentId, 'Configured']
  }
}

function useHookConfigLabels(agents: DiagnosticsAgent[] | undefined): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!agents) return
    const targets = agents.filter(
      (a) => a.hookConfigStatus === 'configured' && PRESET_AGENT_IDS.has(a.id)
    )
    if (targets.length === 0) return

    let cancelled = false
    Promise.all(targets.map((a) => fetchHookConfigLabel(a.id))).then((entries) => {
      if (!cancelled) setLabels(Object.fromEntries(entries))
    })

    return () => {
      cancelled = true
    }
  }, [agents])

  return labels
}

// Badge className overrides — do NOT use variant="destructive" directly
const BADGE_RED = 'border-[var(--destructive)] text-[var(--destructive)] bg-[rgba(255,95,86,0.1)]'
const BADGE_AMBER = 'border-[var(--cwd)] text-[var(--cwd)] bg-transparent'
const BADGE_GREEN = 'border-[var(--worktree)] text-[var(--worktree)] bg-transparent'

function MonoPath({ path, ariaLabel }: { path: string; ariaLabel: string }) {
  return (
    <span className="inline-flex items-center gap-0">
      <span
        className="text-[12px] text-foreground truncate max-w-[220px] inline-block align-bottom"
        title={path}
      >
        {path}
      </span>
      <CopyIconButton
        text={path}
        label={ariaLabel}
        className="ml-1 size-4 opacity-40 hover:opacity-100 hover:bg-transparent"
      />
    </span>
  )
}

function AgentStatusCell({ status }: { status: string }) {
  switch (status) {
    case 'healthy':
      return (
        <Badge variant="outline" className={BADGE_GREEN}>
          Healthy
        </Badge>
      )
    case 'degraded':
      return (
        <Badge variant="outline" className={BADGE_RED}>
          Degraded
        </Badge>
      )
    case 'stale':
      return (
        <Badge variant="outline" className={BADGE_AMBER}>
          Stale
        </Badge>
      )
    case 'no events':
      return <span className="text-[12px] text-muted-foreground">No events yet</span>
    default:
      return <span className="text-[12px] text-muted-foreground">{status}</span>
  }
}

function HookConfigCell({ hookConfigStatus, label }: { hookConfigStatus: string; label?: string }) {
  if (hookConfigStatus === 'missing') {
    return (
      <Badge variant="outline" className={BADGE_RED}>
        Missing
      </Badge>
    )
  }
  if (hookConfigStatus === 'configured') {
    const display = label ?? 'Configured'
    // detectHookConfigLabel returns 'Missing' when config file exists but has no hooks
    if (display === 'Missing') {
      return (
        <Badge variant="outline" className={BADGE_AMBER}>
          No hooks
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className={BADGE_GREEN}>
        {display}
      </Badge>
    )
  }
  if (hookConfigStatus === 'unknown') {
    return (
      <Badge variant="outline" className={BADGE_AMBER}>
        Unknown
      </Badge>
    )
  }
  return <span className="text-[12px] text-muted-foreground">{hookConfigStatus}</span>
}

function CompactDatabaseButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const compact = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/diagnostics/compact', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { rows_compressed: number; before_bytes: number; after_bytes: number } =
        await res.json()
      const saved = Math.max(0, data.before_bytes - data.after_bytes)
      setResult(
        `Reclaimed ${formatBytes(saved)} (${formatBytes(data.before_bytes)} → ${formatBytes(
          data.after_bytes
        )})`
      )
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-3">
      <Button variant="outline" size="sm" onClick={compact} disabled={busy}>
        {busy ? 'Compacting…' : 'Compact database'}
      </Button>
      <p className="text-[12px] text-muted-foreground">
        Compresses stored payloads and reclaims free pages. Safe — no events are deleted.
      </p>
      {result && <p className="text-[12px] text-[var(--worktree)]">{result}</p>}
      {error && <p className="text-[12px] text-[var(--destructive)]">Compaction failed: {error}</p>}
    </div>
  )
}

function LoadedContent({ data, onCompacted }: { data: Diagnostics; onCompacted: () => void }) {
  const hookConfigLabels = useHookConfigLabels(data.agents)
  const agentWarningCount = data.agents.filter(
    (a) =>
      a.status === 'degraded' ||
      a.status === 'stale' ||
      a.hookConfigStatus === 'missing' ||
      (a.hookConfigStatus === 'unknown' && a.eventCount === 0)
  ).length

  // First run = no events anywhere AND no agent has its hooks wired up yet.
  // Once any agent shows "configured", the setup hint is wrong (they're already
  // set up — just waiting for the first event), so suppress it.
  const isFirstRun =
    data.storage.totalEvents === 0 &&
    data.agents.every((a) => a.status === 'no events') &&
    !data.agents.some((a) => a.hookConfigStatus === 'configured')

  return (
    <>
      {/* Summary tile row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-tour="diagnostics-tiles">
        {/* Tile 1 — Binary size */}
        <Card data-tour="diagnostics-health">
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground mb-1">
              <HardDrive className="inline size-4 mr-1 text-muted-foreground" />
              Binary size
            </div>
            <div className="text-[20px] font-semibold">
              {data.version.binarySizeBytes !== null
                ? formatBytes(data.version.binarySizeBytes)
                : 'Unknown'}
            </div>
          </CardContent>
        </Card>

        {/* Tile 2 — DB size */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground mb-1">
              <Database className="inline size-4 mr-1 text-muted-foreground" />
              DB size
            </div>
            <div className="text-[20px] font-semibold">
              {data.storage.dbSizeBytes !== null
                ? formatBytes(data.storage.dbSizeBytes)
                : (data.storage.dbSizeReason ?? 'Unknown')}
            </div>
            <p className="text-[12px] text-muted-foreground mt-1">
              {data.storage.totalEvents.toLocaleString()} events
            </p>
          </CardContent>
        </Card>

        {/* Tile 3 — Hook requests */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground mb-1">
              <Zap className="inline size-4 mr-1 text-muted-foreground" />
              Hook requests
            </div>
            <div className="text-[20px] font-semibold">
              {data.runtime.hookRequests.toLocaleString()}
            </div>
            <p className="text-[12px] text-muted-foreground mt-1">
              {data.runtime.ingestionErrors > 0 ? (
                <span className="text-[var(--destructive)]">
                  {data.runtime.ingestionErrors} errors
                </span>
              ) : (
                'No errors'
              )}
            </p>
          </CardContent>
        </Card>

        {/* Tile 4 — Agent Warnings */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground mb-1">
              <AlertTriangle className="inline size-4 mr-1 text-muted-foreground" />
              Agent Warnings
            </div>
            <div
              className={cn(
                'text-[20px] font-semibold',
                agentWarningCount > 0 ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {agentWarningCount} {agentWarningCount === 1 ? 'warning' : 'warnings'}
            </div>
            <p className="text-[12px] text-muted-foreground mt-1">{data.agents.length} agents</p>
          </CardContent>
        </Card>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — Agent Connectivity */}
        <Card data-tour="diagnostics-agent-connectivity">
          <CardHeader>
            <CardTitle>Agent Connectivity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Agent</TableHead>
                  <TableHead scope="col" className="w-[100px]">
                    Status
                  </TableHead>
                  <TableHead scope="col" className="w-[120px]">
                    Last Seen
                  </TableHead>
                  <TableHead scope="col" className="w-[120px]">
                    Hook Config
                  </TableHead>
                  <TableHead scope="col">Warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.agents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell>{agent.label}</TableCell>
                    <TableCell>
                      <AgentStatusCell status={agent.status} />
                    </TableCell>
                    <TableCell>
                      {agent.lastSeenAt
                        ? formatDistanceToNow(new Date(agent.lastSeenAt), { addSuffix: true })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <HookConfigCell
                        hookConfigStatus={agent.hookConfigStatus}
                        label={hookConfigLabels[agent.id]}
                      />
                    </TableCell>
                    <TableCell>
                      {agent.hookConfigStatus === 'missing' ? (
                        <span className="text-[12px] text-amber-400">missing hook config</span>
                      ) : (
                        (() => {
                          const realWarnings = (agent.warnings ?? []).filter(
                            (w) => w !== 'no events'
                          )
                          if (realWarnings.length === 0) return '—'
                          return (
                            <span>
                              {realWarnings.slice(0, 2).join(', ')}
                              {realWarnings.length > 2 && (
                                <span className="text-muted-foreground ml-1">
                                  +{realWarnings.length - 2} more
                                </span>
                              )}
                            </span>
                          )
                        })()
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {isFirstRun && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-sm text-foreground">No activity observed yet</p>
                <p className="text-xs text-muted-foreground">
                  Run <code className="font-mono">argus setup</code> or{' '}
                  <code className="font-mono">argus doctor</code> to configure hook integrations.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT column */}
        <div className="flex flex-col gap-6">
          {/* System Facts */}
          <Card data-tour="diagnostics-system-facts">
            <CardHeader>
              <CardTitle>System Facts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0">
              {/* Version */}
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">Version</span>
                <span>{data.version.version}</span>
              </div>
              <Separator className="mx-auto w-[85%]!" />
              {/* Commit */}
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">Commit</span>
                <code className="font-mono text-[12px] text-[var(--edit)]">
                  {data.version.commit.slice(0, 8)}
                </code>
              </div>
              <Separator className="mx-auto w-[85%]!" />
              {/* Built */}
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">Built</span>
                <span>
                  {data.version.buildDate
                    ? (() => {
                        try {
                          return format(new Date(data.version.buildDate), 'MMM d, yyyy')
                        } catch {
                          return data.version.buildDate
                        }
                      })()
                    : '—'}
                </span>
              </div>
              <Separator className="mx-auto w-[85%]!" />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">DB Path</span>
                <MonoPath path={data.storage.dbPath} ariaLabel="Copy DB path" />
              </div>
              <Separator className="mx-auto w-[85%]!" />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">DB Size</span>
                <span>
                  {data.storage.dbSizeBytes !== null
                    ? formatBytes(data.storage.dbSizeBytes)
                    : (data.storage.dbSizeReason ?? 'Unknown')}
                </span>
              </div>
              <Separator className="mx-auto w-[85%]!" />
              {/* Runtime */}
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">Started</span>
                <span>
                  {formatDistanceToNow(new Date(data.runtime.startedAt), { addSuffix: true })}
                </span>
              </div>
              <Separator className="mx-auto w-[85%]!" />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">Ingestion errors</span>
                <span
                  className={data.runtime.ingestionErrors > 0 ? 'text-[var(--destructive)]' : ''}
                >
                  {data.runtime.ingestionErrors.toLocaleString()}
                </span>
              </div>
              <Separator className="mx-auto w-[85%]!" />
              {/* DB Health */}
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">DB journal</span>
                <code className="font-mono text-[12px]">{data.dbHealth.journalMode}</code>
              </div>
              <Separator className="mx-auto w-[85%]!" />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">DB pages</span>
                <span>
                  {data.dbHealth.pageCount.toLocaleString()} ×{' '}
                  {formatBytes(data.dbHealth.pageSizeBytes)}
                </span>
              </div>
              <Separator className="mx-auto w-[85%]!" />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">WAL size</span>
                <span>
                  {data.dbHealth.walSizeBytes !== null
                    ? formatBytes(data.dbHealth.walSizeBytes)
                    : '—'}
                </span>
              </div>
              <Separator className="mx-auto w-[85%]!" />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">Migration</span>
                <span>v{data.dbHealth.migrationVersion}</span>
              </div>
              <Separator className="mx-auto w-[85%]!" />
              <CompactDatabaseButton onDone={onCompacted} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

export function DiagnosticsPage() {
  const { data, loading, refreshing, error, lastUpdatedAt, reload } = useDiagnostics()

  return (
    <PageShell>
      {/* Page header — always visible in all states */}
      <PageHeader
        title="Diagnostics"
        actions={
          <>
            {lastUpdatedAt && (
              <span className="text-[12px] text-muted-foreground">
                Updated {formatDistanceToNow(lastUpdatedAt, { addSuffix: true })}
              </span>
            )}
            <Button
              variant="outline"
              size="icon-sm"
              onClick={reload}
              disabled={refreshing}
              aria-label="Refresh diagnostics"
            >
              <RefreshCw data-icon="inline-start" className={cn(refreshing && 'animate-spin')} />
            </Button>
          </>
        }
      />

      {/* Loading branch — skeleton only on first fetch, NOT on refresh (D-14, D-16) */}
      {loading && (
        <div aria-busy="true" className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Skeleton className="h-[80px] rounded-lg" />
            <Skeleton className="h-[80px] rounded-lg" />
            <Skeleton className="h-[80px] rounded-lg" />
            <Skeleton className="h-[80px] rounded-lg" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <Skeleton className="h-[160px]" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </div>
      )}

      {/* Error branch — retry panel (D-09) */}
      {error !== null && !loading && (
        <Card className="p-6 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-foreground">Failed to load diagnostics</p>
          <p className="text-xs text-muted-foreground">Could not reach /api/diagnostics</p>
          <Button variant="outline" size="sm" onClick={reload}>
            Retry Load
          </Button>
        </Card>
      )}

      {/* Loaded branch — full page content */}
      {data !== null && !loading && <LoadedContent data={data} onCompacted={reload} />}
    </PageShell>
  )
}

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Activity, AlertTriangle, Copy, RefreshCw, Shield, Zap } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function MonoPath({ path, ariaLabel }: { path: string; ariaLabel: string }) {
  return (
    <span className="inline-flex items-center gap-0">
      <span
        className="font-mono text-[12px] text-foreground truncate max-w-[220px] inline-block align-bottom"
        title={path}
      >
        {path}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          navigator.clipboard.writeText(path).catch(() => {})
        }}
        className="ml-1 h-auto p-0 opacity-40 hover:opacity-100 transition-opacity"
        aria-label={ariaLabel}
      >
        <Copy className="size-3" />
      </Button>
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

function PrivacySecurityCard({ data }: { data: Diagnostics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy &amp; Security</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0">
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-muted-foreground">Ignore File</span>
          <span className="flex items-center gap-1">
            <MonoPath path={data.privacy.ignoreFile.path} ariaLabel="Copy ignore file path" />
            {data.privacy.ignoreFile.status === 'loaded' && (
              <Badge variant="outline" className={BADGE_GREEN}>
                Active
              </Badge>
            )}
            {data.privacy.ignoreFile.status === 'missing_ok' && (
              <span className="text-[12px] text-muted-foreground">Not configured</span>
            )}
            {data.privacy.ignoreFile.status === 'missing' && (
              <Badge variant="outline" className={BADGE_AMBER}>
                Missing
              </Badge>
            )}
            {data.privacy.ignoreFile.status === 'error' && (
              <Badge variant="outline" className={BADGE_RED}>
                Error
              </Badge>
            )}
          </span>
        </div>
        <Separator />
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-muted-foreground">Active Rules</span>
          <span>{data.privacy.ignoreFile.activePatternCount.toLocaleString()}</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-muted-foreground">Bind Posture</span>
          <span className="flex items-center gap-1">
            <span className="text-[13px]">{data.security.remoteBind.addr}</span>
            {data.security.remoteBind.status === 'loopback' &&
            !data.security.remoteBind.allowRemote ? (
              <Badge variant="outline" className={BADGE_GREEN}>
                Loopback only
              </Badge>
            ) : data.security.remoteBind.status === 'remote' ||
              data.security.remoteBind.allowRemote ? (
              <Badge variant="outline" className={BADGE_RED}>
                Remote enabled
              </Badge>
            ) : (
              <span className="text-[12px] text-muted-foreground">
                {data.security.remoteBind.status}
              </span>
            )}
          </span>
        </div>
        <Separator />
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-muted-foreground">CORS Origins</span>
          <span className="flex items-center gap-1">
            <span className="text-[13px]">
              {data.security.cors.totalOrigins} total, {data.security.cors.localOrigins} local
            </span>
            {data.security.cors.extraOrigins === 0 ? (
              <Badge variant="outline" className={BADGE_GREEN}>
                Local only
              </Badge>
            ) : (
              <Badge variant="outline" className={BADGE_AMBER}>
                {data.security.cors.extraOrigins} extra origin
                {data.security.cors.extraOrigins === 1 ? '' : 's'}
              </Badge>
            )}
          </span>
        </div>
        <Alert className="mt-4 border-[var(--border)] bg-[var(--secondary)]">
          <AlertDescription className="text-xs text-muted-foreground">
            {data.privacy.exportWarning}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}

function LoadedContent({ data }: { data: Diagnostics }) {
  const hookConfigLabels = useHookConfigLabels(data.agents)
  const agentWarningCount = data.agents.filter(
    (a) =>
      a.status === 'degraded' ||
      a.status === 'stale' ||
      a.hookConfigStatus === 'missing' ||
      (a.hookConfigStatus === 'unknown' && a.eventCount === 0)
  ).length

  const privacyWarningCount =
    (data.security.remoteBind.allowRemote ? 1 : 0) +
    (data.security.cors.extraOrigins > 0 ? 1 : 0) +
    (data.privacy.ignoreFile.status === 'error' ? 1 : 0)

  const isFirstRun =
    data.storage.totalEvents === 0 && data.agents.every((a) => a.status === 'no events')

  return (
    <>
      {/* Summary tile row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Tile 1 — Readiness */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground mb-1">
              <Activity className="inline size-4 mr-1 text-muted-foreground" />
              Readiness
            </div>
            <div className="flex items-center gap-1 text-[14px] font-semibold">
              {data.health.ready ? (
                <>
                  <span className="inline-block size-2 rounded-full bg-[var(--worktree)]" />
                  Ready
                </>
              ) : (
                <>
                  <span className="inline-block size-2 rounded-full bg-[var(--destructive)]" />
                  Not ready
                </>
              )}
            </div>
            {!data.health.ready && data.health.reason && (
              <p
                className="text-[12px] text-muted-foreground mt-1 truncate"
                title={data.health.reason}
              >
                {data.health.reason.slice(0, 60)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tile 2 — Events */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground mb-1">
              <Zap className="inline size-4 mr-1 text-muted-foreground" />
              Events
            </div>
            <div className="text-[20px] font-semibold">
              {data.storage.totalEvents.toLocaleString()}
            </div>
            <p className="text-[12px] text-muted-foreground mt-1">
              {data.storage.latestEventAt
                ? `Latest: ${formatDistanceToNow(new Date(data.storage.latestEventAt), { addSuffix: true })}`
                : 'No events yet'}
            </p>
          </CardContent>
        </Card>

        {/* Tile 3 — Agent Warnings */}
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

        {/* Tile 4 — Privacy/Security */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground mb-1">
              <Shield className="inline size-4 mr-1 text-muted-foreground" />
              Privacy Warnings
            </div>
            <div
              className={cn(
                'text-[20px] font-semibold',
                privacyWarningCount > 0 ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {privacyWarningCount} {privacyWarningCount === 1 ? 'warning' : 'warnings'}
            </div>
            <p className="text-[12px] text-muted-foreground mt-1">
              {data.privacy.ignoreFile.activePatternCount} rules active
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — Agent Connectivity */}
        <Card>
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
                  <TableHead scope="col" className="w-[80px]">
                    Events
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
                    <TableCell>{agent.eventCount.toLocaleString()}</TableCell>
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
                      {(agent.warnings ?? []).length === 0 ? (
                        '—'
                      ) : (
                        <span>
                          {(agent.warnings ?? []).slice(0, 2).join(', ')}
                          {(agent.warnings ?? []).length > 2 && (
                            <span className="text-muted-foreground ml-1">
                              +{(agent.warnings ?? []).length - 2} more
                            </span>
                          )}
                        </span>
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
                  Run <code className="font-mono">hooker setup</code> or{' '}
                  <code className="font-mono">hooker doctor</code> to configure hook integrations.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT column */}
        <div className="flex flex-col gap-6">
          {/* System Facts */}
          <Card>
            <CardHeader>
              <CardTitle>System Facts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0">
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">Version</span>
                <span>
                  {data.version.version}{' '}
                  <code className="font-mono text-[12px] text-[var(--edit)]">
                    {data.version.commit.slice(0, 8)}
                  </code>{' '}
                  {data.version.buildDate}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">DB Path</span>
                <MonoPath path={data.storage.dbPath} ariaLabel="Copy DB path" />
              </div>
              <Separator />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">DB Size</span>
                <span>
                  {data.storage.dbSizeBytes !== null
                    ? formatBytes(data.storage.dbSizeBytes)
                    : (data.storage.dbSizeReason ?? 'Unknown')}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">Total Events</span>
                <span>{data.storage.totalEvents.toLocaleString()}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">Total Sessions</span>
                <span>{data.storage.totalSessions.toLocaleString()}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted-foreground">Latest Event</span>
                <span>
                  {data.storage.latestEventAt
                    ? formatDistanceToNow(new Date(data.storage.latestEventAt), { addSuffix: true })
                    : 'None'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Privacy & Security */}
          <PrivacySecurityCard data={data} />
        </div>
      </div>
    </>
  )
}

export function DiagnosticsPage() {
  const { data, loading, refreshing, error, lastUpdatedAt, reload } = useDiagnostics()

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
        {/* Page header — always visible in all states */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[22px] font-semibold text-foreground">Diagnostics</h1>
          <div className="flex items-center gap-2">
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
          </div>
        </div>

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
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
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
        {data !== null && !loading && <LoadedContent data={data} />}
      </div>
    </div>
  )
}

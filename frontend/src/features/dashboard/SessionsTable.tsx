import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { DashboardEmpty } from '@/components/shared/DashboardEmpty'
import { PaginationBar } from '@/components/shared/PaginationBar'
import type { DashboardStats } from './hooks/useDashboardStats'
import { formatSharePercent } from './dashboard-utils'
import { displayProvider, displayProviderModel } from '@/lib/utils'

type SessionsTableProps = {
  stats: DashboardStats
}

const DEFAULT_PAGE_SIZE = 10

function shortSessionId(sessionId: string) {
  if (!sessionId) return 'unknown'
  return sessionId.slice(0, 8)
}

function formatSessionTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || 'unknown time'
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SessionsTable({ stats }: SessionsTableProps) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const totalItems = stats.session_usage.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(page, totalPages - 1)
  const rangeStart = currentPage * pageSize
  const rangeEnd = Math.min(rangeStart + pageSize, totalItems)
  const onPageChange = (nextPage: number) => {
    setPage(Math.max(0, Math.min(totalPages - 1, nextPage)))
  }
  const visibleSessions = useMemo(
    () => stats.session_usage.slice(rangeStart, rangeEnd),
    [stats.session_usage, rangeStart, rangeEnd]
  )

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {stats.session_usage.length > 0 ? (
          <>
            <PaginationBar
              page={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              defaultPageSize={DEFAULT_PAGE_SIZE}
              onPageChange={onPageChange}
              onPageSizeChange={setPageSize}
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5">Session</TableHead>
                  <TableHead className="px-5">Agent</TableHead>
                  <TableHead className="px-5">Models</TableHead>
                  <TableHead className="px-5 text-right">Input tokens</TableHead>
                  <TableHead className="px-5 text-right">Output tokens</TableHead>
                  <TableHead className="px-5 text-right">Cache read</TableHead>
                  <TableHead className="px-5 text-right">Cache write</TableHead>
                  <TableHead className="px-5 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSessions.map((session) => {
                  const sessionCacheRead = session.models.reduce(
                    (sum, model) => sum + model.cache_read,
                    0
                  )
                  const sessionCacheWrite = session.models.reduce(
                    (sum, model) => sum + model.cache_creation,
                    0
                  )
                  const sessionTotal =
                    session.input + session.output + sessionCacheRead + sessionCacheWrite

                  return (
                    <TableRow key={session.session_id}>
                      <TableCell className="px-5 font-medium">
                        <div className="grid gap-1">
                          <span className="font-mono text-xs text-foreground">
                            {shortSessionId(session.session_id)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatSessionTime(session.last_seen_at)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-5">
                        <div className="grid gap-1">
                          <span className="font-medium text-foreground">{session.agent}</span>
                          <span className="text-xs text-muted-foreground">
                            {displayProvider(session.provider)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-5">
                        <div className="flex flex-wrap gap-2">
                          {session.models.map((model) => {
                            const modelTotal =
                              model.input + model.output + model.cache_read + model.cache_creation
                            return (
                              <Badge
                                key={`${session.session_id}-${model.provider}-${model.model}`}
                                variant="outline"
                                className="h-auto max-w-full gap-2 rounded-lg px-2 py-1 text-left"
                              >
                                <span>{displayProviderModel(model.provider, model.model)}</span>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {formatSharePercent(modelTotal, sessionTotal)} ·{' '}
                                  {modelTotal.toLocaleString()}
                                </span>
                              </Badge>
                            )
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 text-right font-mono">
                        {session.input.toLocaleString()}
                      </TableCell>
                      <TableCell className="px-5 text-right font-mono">
                        {session.output.toLocaleString()}
                      </TableCell>
                      <TableCell className="px-5 text-right font-mono">
                        {sessionCacheRead.toLocaleString()}
                      </TableCell>
                      <TableCell className="px-5 text-right font-mono">
                        {sessionCacheWrite.toLocaleString()}
                      </TableCell>
                      <TableCell className="px-5 text-right font-mono font-semibold">
                        {sessionTotal.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </>
        ) : (
          <DashboardEmpty
            title="No sessions"
            description="No session-level token usage data available."
          />
        )}
      </CardContent>
    </Card>
  )
}

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DashboardStats } from '@/hooks/useDashboardStats'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { displayProvider, displayProviderModel } from '@/lib/utils'
import { formatSharePercent, getModelColor, toTokenShareChartData } from './dashboard-utils'

type TokenUsagePanelProps = {
  stats: DashboardStats
}

export function TokenUsagePanel({ stats }: TokenUsagePanelProps) {
  const shareChart = toTokenShareChartData(stats)
  const tokenChartConfig = shareChart.series.reduce<ChartConfig>((config, series, index) => {
    config[series.key] = {
      label: series.label,
      color: getModelColor(series.model, index),
    }
    return config
  }, {})

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Token share by provider / model
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            {shareChart.data.length > 0 ? (
              <div className="grid h-full gap-4">
                <ChartContainer config={tokenChartConfig} className="h-full w-full">
                  <BarChart
                    data={shareChart.data}
                    margin={{ top: 20, right: 30, left: 40, bottom: 30 }}
                    barSize={60}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      type="category"
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      fontSize={11}
                      height={30}
                    />
                    <YAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      fontSize={11}
                      domain={[0, 100]}
                      tickFormatter={(value) => `${Math.round(Number(value))}%`}
                    />
                    <ChartTooltip
                      cursor={{ fill: 'var(--muted)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const item = payload.find((entry) => Number(entry?.value) > 0)
                        if (!item) return null
                        const series = shareChart.series.find((entry) => entry.key === item.dataKey)
                        if (!series) return null
                        return (
                          <div className="min-w-[220px] rounded-lg border border-border bg-background p-3 text-xs shadow-xl">
                            <div className="mb-2 font-semibold text-foreground">{series.label}</div>
                            <TooltipRow label="Tokens" value={series.total.toLocaleString()} />
                            <TooltipRow
                              label="Share"
                              value={formatSharePercent(series.total, shareChart.total)}
                            />
                          </div>
                        )
                      }}
                    />
                    {shareChart.series.map((series) => (
                      <Bar
                        key={series.key}
                        dataKey={series.key}
                        stackId="share"
                        fill={`var(--color-${series.key})`}
                        radius={[0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>

                <div className="grid gap-2">
                  {shareChart.series.map((series, index) => (
                    <div
                      key={series.key}
                      className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm text-foreground">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: getModelColor(series.model, index) }}
                        />
                        {series.label}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {series.total.toLocaleString()} ·{' '}
                        {formatSharePercent(series.total, shareChart.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <DashboardEmpty title="No token usage" description="No token usage data available." />
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stats.session_usage.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5">Session</TableHead>
                  <TableHead className="px-5">Agent</TableHead>
                  <TableHead className="px-5">Models</TableHead>
                  <TableHead className="px-5 text-right">Input tokens</TableHead>
                  <TableHead className="px-5 text-right">Output tokens</TableHead>
                  <TableHead className="px-5 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.session_usage.map((session) => (
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
                          const modelTotal = model.input + model.output
                          const sessionTotal = session.input + session.output
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
                    <TableCell className="px-5 text-right font-mono font-semibold">
                      {(session.input + session.output).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <DashboardEmpty
              title="No sessions"
              description="No session-level token usage data available."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

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

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1 flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function DashboardEmpty({ title, description }: { title: string; description: string }) {
  return (
    <Empty className="h-full border-0">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

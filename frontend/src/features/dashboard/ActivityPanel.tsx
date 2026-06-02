import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { DashboardEmpty } from '@/components/shared/DashboardEmpty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AGENTS } from '@/agents'
import type { DashboardStats } from './hooks/useDashboardStats'
import { toTimelineByAgentChartData } from './dashboard-utils'

type ActivityPanelProps = {
  stats: DashboardStats
  query: string
}

const agentConfigById = new Map(AGENTS.map((agent) => [agent.id, agent] as const))
const agentPalette = ['var(--chart-2)', 'var(--chart-1)', 'var(--chart-4)', 'var(--chart-5)']

export function ActivityPanel({ stats, query }: ActivityPanelProps) {
  const { data: timelineData, series } = useMemo(
    () => toTimelineByAgentChartData(stats, query),
    [query, stats]
  )
  const labelByBucket = useMemo(
    () =>
      new Map(
        timelineData.map((row) => [
          String(row.date),
          typeof row.localLabel === 'string' ? row.localLabel : String(row.date),
        ])
      ),
    [timelineData]
  )
  const activityChartConfig = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        series.map((agent, index) => [
          agent,
          {
            label: agentLabel(agent),
            color: agentColor(agent, index),
          },
        ])
      ),
    [series]
  )

  return (
    <div className="grid gap-4">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Events over time
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="h-[300px] min-w-0 w-full">
            {timelineData.length > 0 ? (
              <ChartContainer config={activityChartConfig} className="h-full w-full">
                <AreaChart data={timelineData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    {series.map((agent) => (
                      <linearGradient
                        key={`color-${agent}`}
                        id={`color-${agent}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={`var(--color-${agent})`} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={`var(--color-${agent})`} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                  <XAxis
                    dataKey="date"
                    stroke="#666"
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => labelByBucket.get(String(value)) || String(value)}
                  />
                  <YAxis stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) =>
                          labelByBucket.get(String(value)) || String(value)
                        }
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  {series.map((agent) => (
                    <Area
                      key={agent}
                      type="monotone"
                      dataKey={agent}
                      name={agentLabel(agent)}
                      stroke={`var(--color-${agent})`}
                      strokeWidth={2}
                      fill={`url(#color-${agent})`}
                      fillOpacity={1}
                    />
                  ))}
                </AreaChart>{' '}
              </ChartContainer>
            ) : (
              <DashboardEmpty title="No activity" description="No activity data available." />
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Top actions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-5">Action</TableHead>
                <TableHead className="px-5 text-right">Count</TableHead>
                <TableHead className="w-[40%] px-5 text-right">Distribution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.top_actions.map((action, index) => {
                const maxVal = stats.top_actions[0]?.value || 1
                const pct = (action.value / maxVal) * 100
                return (
                  <TableRow key={`${action.name}-${index}`}>
                    <TableCell className="px-5 font-medium">{action.name}</TableCell>
                    <TableCell className="px-5 text-right font-mono">
                      {action.value.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-5">
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function agentLabel(agent: string) {
  return agentConfigById.get(agent as (typeof AGENTS)[number]['id'])?.label || agent
}

function agentColor(agent: string, index: number) {
  if (agent === 'codex') return 'var(--chart-2)'
  if (agent === 'claudecode') return 'var(--chart-1)'
  return agentPalette[index % agentPalette.length]
}

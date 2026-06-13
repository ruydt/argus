import { memo, useMemo } from 'react'
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
import { AGENTS } from '@/agents'
import type { DashboardStats } from './hooks/useDashboardStats'
import { toTokenTimelineByAgentData } from './dashboard-utils'

type TokenTimelineChartProps = {
  stats: DashboardStats
  query?: string
}

const agentConfigById = new Map(AGENTS.map((agent) => [agent.id, agent] as const))
const agentPalette = ['var(--chart-2)', 'var(--chart-1)', 'var(--chart-4)', 'var(--chart-5)']

function agentLabel(agent: string) {
  return agentConfigById.get(agent as (typeof AGENTS)[number]['id'])?.label || agent
}

function agentColor(agent: string, index: number) {
  if (agent === 'codex') return 'var(--chart-2)'
  if (agent === 'claudecode') return 'var(--chart-1)'
  return agentPalette[index % agentPalette.length]
}

export const TokenTimelineChart = memo(function TokenTimelineChart({
  stats,
  query = '',
}: TokenTimelineChartProps) {
  const { data, series } = useMemo(() => toTokenTimelineByAgentData(stats, query), [stats, query])
  const xAxisTicks = useMemo(
    () => (data.length <= 31 ? data.map((row) => String(row.date)) : undefined),
    [data]
  )

  const labelByBucket = useMemo(
    () =>
      new Map(
        data.map((row) => [
          String(row.date),
          typeof row.localLabel === 'string' ? row.localLabel : String(row.date),
        ])
      ),
    [data]
  )

  const chartConfig = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        series.map((agent, index) => [
          agent,
          { label: agentLabel(agent), color: agentColor(agent, index) },
        ])
      ),
    [series]
  )
  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Tokens over time
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="h-[300px] min-w-0 w-full">
          {data.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-full w-[calc(100%+40px)] -mx-5">
              <AreaChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
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
                  ticks={xAxisTicks}
                  interval={xAxisTicks ? 0 : 'preserveStartEnd'}
                  tickFormatter={(value) => labelByBucket.get(String(value)) || String(value)}
                />
                <YAxis
                  stroke="#666"
                  fontSize={10}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => {
                    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
                    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
                    return value
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => labelByBucket.get(String(value)) || String(value)}
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
            <DashboardEmpty title="No token data" description="No token usage recorded yet." />
          )}
        </div>
      </CardContent>
    </Card>
  )
})

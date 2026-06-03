import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { DashboardEmpty } from '@/components/shared/DashboardEmpty'
import type { DashboardStats } from './hooks/useDashboardStats'
import { toTokenChartData } from './dashboard-utils'
import { displayProviderModel } from '@/lib/utils'

const tokensChartConfig = {
  input: {
    label: 'Input Tokens',
    color: '#0ea5e9',
  },
  output: {
    label: 'Output Tokens',
    color: '#22c55e',
  },
  cache_creation: {
    label: 'Cache Creation',
    color: '#eab308',
  },
  cache_read: {
    label: 'Cache Read',
    color: '#a855f7',
  },
} satisfies ChartConfig

type TokenUsageChartProps = {
  stats: DashboardStats
}

export function TokenUsageChart({ stats }: TokenUsageChartProps) {
  const chartData = toTokenChartData(stats)

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">Tokens by Model</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="h-[300px] min-w-0 w-full">
          {chartData.length > 0 ? (
            <ChartContainer config={tokensChartConfig} className="h-full w-full">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 0, left: 0, bottom: 20 }}
                barSize={60}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="model"
                  fontSize={10}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => {
                    const [prov, mod] = val.split('/')
                    return displayProviderModel(prov, mod)
                  }}
                />
                <YAxis
                  fontSize={10}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
                    return value
                  }}
                />
                <ChartTooltip
                  cursor={false}
                  isAnimationActive={false}
                  animationDuration={0}
                  content={<TooltipContent />}
                />
                <Legend content={<LegendContent />} verticalAlign="top" />
                <Bar
                  dataKey="cache_read"
                  stackId="a"
                  fill="var(--color-cache_read)"
                  radius={[0, 0, 4, 4]}
                />
                <Bar dataKey="input" stackId="a" fill="var(--color-input)" />
                <Bar dataKey="cache_creation" stackId="a" fill="var(--color-cache_creation)" />
                <Bar
                  dataKey="output"
                  stackId="a"
                  fill="var(--color-output)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <DashboardEmpty title="No token usage" description="No tokens consumed." />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

type TooltipContentProps = {
  active?: boolean
  payload?: Array<{ name: string; value: number; fill: string; dataKey: string }>
  label?: string
}

function TooltipContent({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null

  const [prov, mod] = (label || '').split('/')
  const displayTitle = displayProviderModel(prov, mod)

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <div className="mb-2 border-b pb-1 font-medium text-foreground">{displayTitle}</div>
      <div className="flex flex-col gap-1">
        {payload.map((entry) => {
          if (!entry.value) return null
          return (
            <TooltipRow
              key={entry.dataKey}
              label={entry.name}
              value={entry.value.toLocaleString()}
              color={entry.fill}
            />
          )
        })}
      </div>
    </div>
  )
}

function TooltipRow({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <div className="size-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

type LegendContentProps = {
  payload?: Array<{ value: string; color: string }>
}

function LegendContent({ payload }: LegendContentProps) {
  if (!payload?.length) return null
  return (
    <div className="mb-4 flex flex-wrap justify-center gap-3 text-xs sm:text-sm">
      {payload.map((entry) => (
        <div key={entry.value} className="flex items-center gap-2">
          <div className="size-3 rounded-sm" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

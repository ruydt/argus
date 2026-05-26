import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardStats } from './hooks/useDashboardStats'
import { formatTokenCount } from '@/lib/format'

type SummaryStatsProps = {
  stats: DashboardStats
}

function totalCacheRead(stats: DashboardStats) {
  return stats.agent_usage.reduce((sum, usage) => sum + usage.cache_read, 0)
}

function totalCacheWrite(stats: DashboardStats) {
  return stats.agent_usage.reduce((sum, usage) => sum + usage.cache_creation, 0)
}

const STAT_LABELS = [
  {
    key: 'total_sessions',
    label: 'Sessions',
    value: (stats: DashboardStats) => stats.total_sessions,
    format: (value: number) => value.toLocaleString(),
  },
  {
    key: 'total_events',
    label: 'Events',
    value: (stats: DashboardStats) => stats.total_events,
    format: (value: number) => value.toLocaleString(),
  },
  {
    key: 'total_input_tokens',
    label: 'Input tokens',
    value: (stats: DashboardStats) => stats.total_input_tokens,
    format: formatTokenCount,
  },
  {
    key: 'total_output_tokens',
    label: 'Output tokens',
    value: (stats: DashboardStats) => stats.total_output_tokens,
    format: formatTokenCount,
  },
  {
    key: 'total_cache_read_tokens',
    label: 'Cache read tokens',
    value: (stats: DashboardStats) => totalCacheRead(stats),
    format: formatTokenCount,
  },
  {
    key: 'total_cache_write_tokens',
    label: 'Cache write tokens',
    value: (stats: DashboardStats) => totalCacheWrite(stats),
    format: formatTokenCount,
  },
  {
    key: 'total_tokens',
    label: 'Total tokens',
    value: (stats: DashboardStats) =>
      stats.total_input_tokens +
      stats.total_output_tokens +
      totalCacheRead(stats) +
      totalCacheWrite(stats),
    format: formatTokenCount,
  },
] as const

export function SummaryStats({ stats }: SummaryStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
      {STAT_LABELS.map((item) => (
        <Card key={item.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground" data-testid="stat-value">
              {item.format(item.value(stats))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

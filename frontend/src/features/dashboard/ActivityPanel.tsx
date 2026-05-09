import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
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
import type { DashboardStats } from './hooks/useDashboardStats'
import { toTimelineData } from './dashboard-utils'

type ActivityPanelProps = {
  stats: DashboardStats
}

const activityChartConfig = {
  count: {
    label: 'Events',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig

export function ActivityPanel({ stats }: ActivityPanelProps) {
  const timelineData = toTimelineData(stats)

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
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="eventGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="localLabel" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--color-count)"
                    strokeWidth={2}
                    fill="url(#eventGrad)"
                  />
                </AreaChart>
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

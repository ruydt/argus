import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ActivityPanel } from '@/features/dashboard/ActivityPanel'
import { DashboardSkeleton } from '@/features/dashboard/DashboardSkeleton'
import { SummaryStats } from '@/features/dashboard/SummaryStats'
import { TokenUsagePanel } from '@/features/dashboard/TokenUsagePanel'
import { DASHBOARD_TIME_RANGES, apiRange } from '@/features/dashboard/dashboard-utils'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'
import { cn } from '@/lib/utils'

export function Dashboard() {
  const [timeRange, setTimeRange] = useState('all')
  const [view, setView] = useState<'activity' | 'tokens'>('tokens')
  const { stats, loading, refreshing, reload } = useDashboardStats(apiRange(timeRange))

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[22px] font-semibold text-foreground">Usage</h1>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(value) => value && setTimeRange(value)}
              variant="outline"
              size="sm"
              className="w-full flex-wrap sm:w-auto"
            >
              {DASHBOARD_TIME_RANGES.map((range) => (
                <ToggleGroupItem key={range.value} value={range.value} aria-label={range.label}>
                  {range.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={reload}
              disabled={refreshing}
              aria-label="Reload dashboard"
            >
              <RefreshCw data-icon="inline-start" className={cn(refreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {loading || !stats ? (
          <DashboardSkeleton />
        ) : (
          <>
            <SummaryStats stats={stats} />
            <Tabs value={view} onValueChange={(value) => setView(value as 'activity' | 'tokens')}>
              <TabsList variant="line" className="w-full flex-wrap justify-start sm:w-auto">
                <TabsTrigger value="tokens">Token usage</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              <TabsContent value="tokens">
                <TokenUsagePanel stats={stats} />
              </TabsContent>
              <TabsContent value="activity">
                <ActivityPanel stats={stats} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  )
}

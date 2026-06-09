import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivityPanel } from '@/features/dashboard/ActivityPanel'
import { DashboardSkeleton } from '@/features/dashboard/DashboardSkeleton'
import { SummaryStats } from '@/features/dashboard/SummaryStats'
import { TokenUsagePanel } from '@/features/dashboard/TokenUsagePanel'
import {
  presetToDateRange,
  rangeToDashboardQuery,
  type DashboardRangePreset,
} from '@/features/dashboard/date-range'
import { DashboardDateRangePicker } from '@/features/dashboard/date-range-picker'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const [preset, setPreset] = useState<DashboardRangePreset>('14d')
  const [range, setRange] = useState<DateRange>(() => presetToDateRange('14d'))
  const [view, setView] = useState<'activity' | 'tokens'>('tokens')
  const query = rangeToDashboardQuery(range)
  const { stats, loading, refreshing, reload } = useDashboardStats(query)

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[22px] font-semibold text-foreground">Summary</h1>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <DashboardDateRangePicker
              value={range}
              preset={preset}
              onPresetChange={(nextPreset) => {
                if (nextPreset === 'custom') return
                setPreset(nextPreset)
                setRange(presetToDateRange(nextPreset))
              }}
              onRangeChange={(nextRange) => {
                setPreset('custom')
                setRange(nextRange)
              }}
            />
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
                <TokenUsagePanel stats={stats} query={query} />
              </TabsContent>
              <TabsContent value="activity">
                <ActivityPanel stats={stats} query={query} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  )
}

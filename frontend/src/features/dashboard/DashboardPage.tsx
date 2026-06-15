import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, PageShell } from '@/components/shared/PageShell'
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
import { downloadStatsCsv } from '@/features/dashboard/dashboard-export'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const [preset, setPreset] = useState<DashboardRangePreset>('14d')
  const [range, setRange] = useState<DateRange>(() => presetToDateRange('14d'))
  const [view, setView] = useState<'activity' | 'tokens'>('tokens')
  const query = rangeToDashboardQuery(range)
  const { stats, loading, refreshing, reload } = useDashboardStats(query)

  return (
    <PageShell>
      <PageHeader
        title="Summary"
        actions={
          <>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => stats && downloadStatsCsv(stats, range)}
              disabled={!stats}
              aria-label="Download dashboard stats as CSV"
              data-tour="dashboard-export"
            >
              <Download data-icon="inline-start" />
            </Button>
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
          </>
        }
      />

      {loading || !stats ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div data-tour="dashboard-stats">
            <SummaryStats stats={stats} />
          </div>
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as 'activity' | 'tokens')}
            data-tour="dashboard-chart"
          >
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
    </PageShell>
  )
}

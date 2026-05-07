import { useEffect } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOpenAIUsage } from './hooks/useOpenAIUsage'
import { UsageCharts } from './UsageCharts'
import { UsageTables } from './UsageTables'

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const

export function UsagePage() {
  const { apiKey, setApiKey, timeRange, setTimeRange, loading, error, stats, fetchUsage } =
    useOpenAIUsage()

  useEffect(() => {
    if (apiKey) {
      fetchUsage()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange])

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[22px] font-semibold text-foreground">OpenAI Usage</h1>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="password"
              placeholder="OpenAI Admin API Key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-[280px]"
            />
            <Select
              value={timeRange.toString()}
              onValueChange={(val) => setTimeRange(Number(val))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TIME_RANGES.map((r) => (
                    <SelectItem key={r.days} value={r.days.toString()}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button onClick={fetchUsage} disabled={loading} variant="secondary">
              {loading ? 'Loading...' : 'Fetch'}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!apiKey ? (
          <div className="flex h-[300px] items-center justify-center rounded-lg border border-border bg-card text-center text-muted-foreground">
            <div className="max-w-[400px]">
              <p className="mb-2 font-medium">Admin API Key Required</p>
              <p className="text-sm">
                Enter your OpenAI Admin API key to view organization-wide usage statistics. This key
                is stored locally in your browser.
              </p>
            </div>
          </div>
        ) : loading && !stats ? (
          <div className="flex h-[300px] items-center justify-center rounded-lg border border-border bg-card">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm font-medium animate-pulse">Loading usage data...</p>
            </div>
          </div>
        ) : stats ? (
          <div className="flex flex-col gap-6 fade-in duration-500">
            <UsageCharts stats={stats} />
            <UsageTables stats={stats} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

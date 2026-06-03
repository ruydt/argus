import { useCallback, useEffect, useRef, useState } from 'react'
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

const PROVIDERS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
] as const

type UsagePanelProps = {
  title?: string
  dashboardRange?: string
}

export function UsagePanel({ title = 'OpenAI Usage', dashboardRange = '7d' }: UsagePanelProps) {
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai')
  const [anthropicApiKey, setAnthropicApiKey] = useState(
    () => localStorage.getItem('anthropic_admin_key') ?? ''
  )
  const { apiKey, setApiKey, loading, error, stats, fetchUsage } = useOpenAIUsage(
    dashboardRange,
    provider,
    anthropicApiKey
  )
  const isOpenAI = provider === 'openai'
  const currentApiKey = isOpenAI ? apiKey : anthropicApiKey
  const setCurrentApiKey = isOpenAI ? setApiKey : setAnthropicApiKey

  const fetchUsageRef = useRef(fetchUsage)
  useEffect(() => {
    fetchUsageRef.current = fetchUsage
  }, [fetchUsage])

  const fetchUsageIfKeyPresent = useCallback(() => {
    if (currentApiKey) {
      fetchUsageRef.current()
    }
  }, [currentApiKey])

  useEffect(() => {
    fetchUsageIfKeyPresent()
  }, [dashboardRange, fetchUsageIfKeyPresent])

  useEffect(() => {
    localStorage.setItem('anthropic_admin_key', anthropicApiKey)
  }, [anthropicApiKey])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        {title ? <h1 className="text-[22px] font-semibold text-foreground">{title}</h1> : null}
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Input
            type="password"
            placeholder={isOpenAI ? 'OpenAI Admin API Key...' : 'Anthropic Admin API Key...'}
            value={currentApiKey}
            onChange={(e) => setCurrentApiKey(e.target.value)}
            className="w-full sm:w-[280px]"
          />
          <Select
            value={provider}
            onValueChange={(val) => setProvider(val as 'openai' | 'anthropic')}
          >
            <SelectTrigger className="w-full sm:w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            onClick={fetchUsage}
            disabled={loading}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            {loading ? 'Loading...' : 'Fetch'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!currentApiKey ? (
        <div className="flex h-[300px] items-center justify-center rounded-lg border border-border bg-card text-center text-muted-foreground">
          <div className="max-w-[400px]">
            <p className="mb-2 font-medium">Admin API Key Required</p>
            <p className="text-sm">
              Enter your {isOpenAI ? 'OpenAI' : 'Anthropic'} Admin API key to view usage statistics.
              This key is stored locally in your browser.
            </p>
          </div>
        </div>
      ) : loading && !stats ? (
        <div className="flex h-[300px] items-center justify-center rounded-lg border border-border bg-card">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm font-medium animate-pulse">Loading usage data…</p>
          </div>
        </div>
      ) : stats ? (
        <div className="flex flex-col gap-6 fade-in duration-500">
          <UsageCharts stats={stats} />
          <UsageTables stats={stats} />
        </div>
      ) : null}
    </div>
  )
}

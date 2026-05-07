import { useEffect, useState } from 'react'
import type { OpenAIUsageResponse, UsageDailyPoint, UsageStats } from '@/types/usage'

const USAGE_BUCKET_LIMIT = 31

export function useOpenAIUsage() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openai_admin_key') ?? '')
  const [timeRange, setTimeRange] = useState(
    () => Number(localStorage.getItem('openai_usage_range')) || 7
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<UsageStats | null>(null)

  useEffect(() => {
    localStorage.setItem('openai_admin_key', apiKey)
  }, [apiKey])

  useEffect(() => {
    localStorage.setItem('openai_usage_range', timeRange.toString())
  }, [timeRange])

  const emptyUsageResponse: OpenAIUsageResponse = { data: [] }

  const readUsageResponse = async (response: Response): Promise<OpenAIUsageResponse> => {
    if (!response.ok) return emptyUsageResponse
    try {
      return (await response.json()) as OpenAIUsageResponse
    } catch {
      return emptyUsageResponse
    }
  }

  const readPrimaryUsageResponse = async (response: Response): Promise<OpenAIUsageResponse> => {
    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status}`
      try {
        const d = (await response.json()) as OpenAIUsageResponse
        if (d.error?.message) errorMsg = d.error.message
      } catch {
        errorMsg = `Backend returned ${response.status}: Please make sure to restart your Go backend!`
      }
      throw new Error(errorMsg)
    }
    return (await response.json()) as OpenAIUsageResponse
  }

  const getBucketDate = (bucketStartTime: number) =>
    new Date(bucketStartTime * 1000).toISOString().split('T')[0]

  const fetchUsagePages = async (
    start: number,
    end: number,
    headers: HeadersInit,
    groupBy?: 'model' | 'api_key_id'
  ): Promise<OpenAIUsageResponse> => {
    let page: string | undefined
    let pagesFetched = 0
    const maxPages = Math.ceil(timeRange / USAGE_BUCKET_LIMIT) + 1
    const seenPages = new Set<string>()
    const data: NonNullable<OpenAIUsageResponse['data']> = []

    try {
      do {
        if (pagesFetched >= maxPages || (page && seenPages.has(page))) break
        if (page) seenPages.add(page)
        pagesFetched += 1

        const params = new URLSearchParams({
          start_time: String(start),
          end_time: String(end),
          bucket_width: '1d',
          limit: String(USAGE_BUCKET_LIMIT),
        })
        if (groupBy) params.set('group_by', groupBy)
        if (page) params.set('page', page)

        const response = await readUsageResponse(
          await fetch(`/api/openai/usage/completions?${params.toString()}`, { headers })
        )
        data.push(...(response.data ?? []))
        page = response.has_more ? (response.next_page ?? undefined) : undefined
      } while (page)

      return { data }
    } catch {
      return emptyUsageResponse
    }
  }

  const fetchPrimaryUsagePages = async (
    start: number,
    end: number,
    headers: HeadersInit
  ): Promise<OpenAIUsageResponse> => {
    let page: string | undefined
    let pagesFetched = 0
    const maxPages = Math.ceil(timeRange / USAGE_BUCKET_LIMIT) + 1
    const seenPages = new Set<string>()
    const data: NonNullable<OpenAIUsageResponse['data']> = []

    do {
      if (pagesFetched >= maxPages || (page && seenPages.has(page))) break
      if (page) seenPages.add(page)
      pagesFetched += 1

      const params = new URLSearchParams({
        start_time: String(start),
        end_time: String(end),
        bucket_width: '1d',
        limit: String(USAGE_BUCKET_LIMIT),
      })
      if (page) params.set('page', page)

      const response = await readPrimaryUsageResponse(
        await fetch(`/api/openai/usage/completions?${params.toString()}`, { headers })
      )
      data.push(...(response.data ?? []))
      page = response.has_more ? (response.next_page ?? undefined) : undefined
    } while (page)

    return { data }
  }

  const makeDailyPoint = (date: string): UsageDailyPoint => ({
    date,
    tokens: 0,
    requests: 0,
    models: {},
  })

  const fetchUsage = async () => {
    const key = apiKey.trim()
    if (!key) {
      setError('Please enter an Admin API Key.')
      return
    }

    setLoading(true)
    setError('')
    setStats(null)

    try {
      const end = Math.floor(Date.now() / 1000)
      const start = end - timeRange * 24 * 60 * 60
      const headers = { Authorization: 'Bearer ' + key }

      const [compData, modData, keyData] = await Promise.all([
        fetchPrimaryUsagePages(start, end, headers),
        fetchUsagePages(start, end, headers, 'model'),
        fetchUsagePages(start, end, headers, 'api_key_id'),
      ])

      let totalReqs = 0
      let totalToks = 0
      const modelsBreakdown: Record<string, number> = {}
      const keysBreakdown: Record<string, number> = {}
      const dailyMap = new Map<string, UsageDailyPoint>()

      ;(compData.data ?? []).forEach((bucket) => {
        const date = getBucketDate(bucket.start_time)
        const requestCount =
          bucket.results?.reduce((sum, result) => sum + Number(result.num_model_requests || 0), 0) ?? 0
        const tokenCount =
          bucket.results?.reduce(
            (sum, result) => sum + Number(result.input_tokens || 0) + Number(result.output_tokens || 0),
            0
          ) ?? 0

        totalReqs += requestCount
        totalToks += tokenCount
        dailyMap.set(date, {
          date,
          tokens: tokenCount,
          requests: requestCount,
          models: {},
        })
      })

      ;(modData.data ?? []).forEach((bucket) => {
        const date = getBucketDate(bucket.start_time)
        const dayEntry = dailyMap.get(date) ?? makeDailyPoint(date)
        dailyMap.set(date, dayEntry)

        bucket.results?.forEach((result) => {
          if (!result.model) return
          const count = Number(result.num_model_requests || 0)
          modelsBreakdown[result.model] = (modelsBreakdown[result.model] || 0) + count
          dayEntry.models[result.model] = (dayEntry.models[result.model] || 0) + count
        })
      })

      ;(keyData.data ?? []).forEach((bucket) => {
        bucket.results?.forEach((result) => {
          if (!result.api_key_id) return
          keysBreakdown[result.api_key_id] =
            (keysBreakdown[result.api_key_id] || 0) +
            Number(result.input_tokens || 0) +
            Number(result.output_tokens || 0)
        })
      })

      const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
      setStats({
        reqs: Number(totalReqs) || 0,
        toks: Number(totalToks) || 0,
        models: modelsBreakdown,
        keys: keysBreakdown,
        daily,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage')
    } finally {
      setLoading(false)
    }
  }

  return { apiKey, setApiKey, timeRange, setTimeRange, loading, error, stats, fetchUsage }
}

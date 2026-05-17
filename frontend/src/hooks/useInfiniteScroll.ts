import { useCallback, useEffect, useRef, useState } from 'react'

export interface PageResult<T> {
  items: T[]
  hasMore: boolean
}

interface InfiniteScrollState<T> {
  resetKey: unknown
  items: T[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
}

export function useInfiniteScroll<T>(
  fetchPage: (page: number) => Promise<PageResult<T>>,
  resetKey: unknown,
  pageSize = 20
) {
  const [state, setState] = useState<InfiniteScrollState<T>>({
    resetKey,
    items: [],
    loading: true,
    loadingMore: false,
    hasMore: true,
  })
  const pageRef = useRef(0)
  const busyRef = useRef(false)
  const hasMoreRef = useRef(true)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const fetchRef = useRef(fetchPage)
  const resetKeyRef = useRef(resetKey)

  useEffect(() => {
    fetchRef.current = fetchPage
  }, [fetchPage])

  const loadNext = useCallback(async () => {
    if (busyRef.current || !hasMoreRef.current) return
    busyRef.current = true
    const nextPage = pageRef.current + 1
    const isFirst = nextPage === 1
    const currentResetKey = resetKeyRef.current
    if (!isFirst) {
      setState((prev) =>
        Object.is(prev.resetKey, currentResetKey) ? { ...prev, loadingMore: true } : prev
      )
    }

    try {
      const result = await fetchRef.current(nextPage)
      if (!Object.is(resetKeyRef.current, currentResetKey)) return

      pageRef.current = nextPage
      hasMoreRef.current = result.hasMore
      setState((prev) => ({
        resetKey: currentResetKey,
        items: isFirst ? result.items : [...prev.items, ...result.items],
        loading: false,
        loadingMore: false,
        hasMore: result.hasMore,
      }))
    } finally {
      busyRef.current = false
      setState((prev) => {
        if (!Object.is(resetKeyRef.current, currentResetKey)) return prev
        if (Object.is(prev.resetKey, currentResetKey)) {
          return { ...prev, loading: false, loadingMore: false }
        }

        return {
          resetKey: currentResetKey,
          items: [],
          loading: false,
          loadingMore: false,
          hasMore: hasMoreRef.current,
        }
      })
    }
  }, [])

  useEffect(() => {
    resetKeyRef.current = resetKey
    pageRef.current = 0
    busyRef.current = false
    hasMoreRef.current = true
    void loadNext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadNext()
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadNext])

  const isCurrent = Object.is(state.resetKey, resetKey)

  return {
    items: isCurrent ? state.items : [],
    loading: isCurrent ? state.loading : true,
    loadingMore: isCurrent ? state.loadingMore : false,
    hasMore: isCurrent ? state.hasMore : true,
    sentinelRef,
    pageSize,
  }
}

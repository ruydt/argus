import { useCallback, useEffect, useRef, useState } from 'react'

export interface PageResult<T> {
  items: T[]
  hasMore: boolean
}

export function useInfiniteScroll<T>(
  fetchPage: (page: number) => Promise<PageResult<T>>,
  resetKey: unknown,
  pageSize = 20,
) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const pageRef = useRef(0)
  const busyRef = useRef(false)
  const hasMoreRef = useRef(true)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const fetchRef = useRef(fetchPage)
  fetchRef.current = fetchPage

  const loadNext = useCallback(async () => {
    if (busyRef.current || !hasMoreRef.current) return
    busyRef.current = true
    const nextPage = pageRef.current + 1
    const isFirst = nextPage === 1
    if (isFirst) setLoading(true)
    else setLoadingMore(true)
    try {
      const result = await fetchRef.current(nextPage)
      pageRef.current = nextPage
      hasMoreRef.current = result.hasMore
      setItems(prev => (isFirst ? result.items : [...prev, ...result.items]))
      setHasMore(result.hasMore)
    } finally {
      busyRef.current = false
      if (isFirst) setLoading(false)
      else setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    pageRef.current = 0
    busyRef.current = false
    hasMoreRef.current = true
    setItems([])
    setHasMore(true)
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
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadNext])

  return { items, loading, loadingMore, hasMore, sentinelRef, pageSize }
}

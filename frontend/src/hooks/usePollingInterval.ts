import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Run callback every `ms` while the document is visible. Pauses entirely when
 * the tab is hidden and fires immediately on return, so a hidden tab costs
 * zero CPU and the data is never stale on screen.
 */
export function usePollingInterval(callback: () => void, ms: number, enabled = true) {
  const callbackRef = useRef(callback)
  // Keep the latest callback without restarting the interval. Written in a
  // layout effect (not during render) so React 19's refs rule is satisfied.
  useLayoutEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (!enabled) return

    let interval: number | null = null

    const start = () => {
      if (interval !== null) return
      interval = window.setInterval(() => callbackRef.current(), ms)
    }
    const stop = () => {
      if (interval !== null) {
        window.clearInterval(interval)
        interval = null
      }
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop()
      } else {
        callbackRef.current()
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [ms, enabled])
}

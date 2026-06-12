import { useEffect, useState } from 'react'

// Isolated so the per-second tick re-renders only this span, not the whole
// app shell and outlet tree.
export function HeaderClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span
      data-testid="header-clock"
      className="tabular-nums text-[#444] shrink-0 font-medium text-right"
    >
      {now.toLocaleDateString()} {now.toLocaleTimeString()}
    </span>
  )
}

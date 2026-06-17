import { useState } from 'react'
import { usePollingInterval } from '@/hooks/usePollingInterval'

// Isolated so the per-second tick re-renders only this span, not the whole
// app shell and outlet tree.
export function HeaderClock() {
  const [now, setNow] = useState(() => new Date())

  usePollingInterval(() => setNow(new Date()), 1000)

  return (
    <span
      data-testid="header-clock"
      className="tabular-nums text-muted-foreground shrink-0 font-medium text-right"
    >
      {now.toLocaleDateString()} {now.toLocaleTimeString()}
    </span>
  )
}

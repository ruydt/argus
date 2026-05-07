import type { DashboardStats } from './hooks/useDashboardStats'
import { TokenUsageChart } from './TokenUsageChart'
import { SessionsTable } from './SessionsTable'

type TokenUsagePanelProps = {
  stats: DashboardStats
}

export function TokenUsagePanel({ stats }: TokenUsagePanelProps) {
  return (
    <div className="grid gap-4">
      <TokenUsageChart stats={stats} />
      <SessionsTable stats={stats} />
    </div>
  )
}

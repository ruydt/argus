import { useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts'
import { useDashboardStats } from '../hooks/useDashboardStats'

const MODEL_COLORS: Record<string, string> = {
  'gpt-4o': '#10a37f',
  'gpt-4-turbo': '#6e44ff',
  'gpt-5.4': '#ab68ff',
  'claude-3-5-sonnet-20241022': '#d97706',
  'claude-3-opus-20240229': '#ea580c',
}

function getModelColor(model: string, idx: number) {
  if (MODEL_COLORS[model]) return MODEL_COLORS[model]
  const fallback = ['#10a37f', '#6e44ff', '#d97706', '#3b82f6', '#ef4444', '#8b5cf6']
  return fallback[idx % fallback.length]
}

const TIME_RANGES = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: 'All', value: '' },
]

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

export function Dashboard() {
  const [timeRange, setTimeRange] = useState('')
  const [view, setView] = useState<'activity' | 'tokens'>('tokens')
  const { stats, loading } = useDashboardStats(timeRange)

  const tokenChartData = useMemo(() => {
    if (!stats) return []
    return stats.agent_usage.map(u => ({
      label: `${u.agent} / ${u.model}`,
      agent: u.agent,
      model: u.model,
      input: u.input,
      output: u.output,
      total: u.input + u.output,
    }))
  }, [stats])

  // Group timeline data with model info for stacked area (simplified: just event count)
  const timelineData = useMemo(() => {
    if (!stats) return []
    return stats.timeline.map(t => ({
      ...t,
      // Convert UTC date label to local for display
      localLabel: (() => {
        const utcDate = new Date(t.date.replace(' ', 'T') + ':00Z')
        if (isNaN(utcDate.getTime())) return t.date
        return utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      })()
    }))
  }, [stats])

  if (loading || !stats) {
    return (
      <div className="flex-1 bg-[#f7f7f8] dark:bg-[#0d0d0d] flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">Loading usage data...</div>
      </div>
    )
  }

  const { total_sessions, total_events, total_input_tokens, total_output_tokens, top_actions } = stats

  return (
    <div className="flex-1 overflow-y-auto bg-[#0d0d0d] text-white">
      <div className="max-w-[1200px] mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[22px] font-semibold text-white">Usage</h1>
          <div className="flex items-center border border-[#2d2d2d] rounded-lg overflow-hidden">
            {TIME_RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => setTimeRange(r.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  timeRange === r.value
                    ? 'bg-[#2d2d2d] text-white'
                    : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-[#161616] border border-[#2d2d2d] rounded-xl p-4">
            <div className="text-[#888] text-xs font-medium mb-1">Sessions</div>
            <div className="text-2xl font-semibold text-white">{total_sessions.toLocaleString()}</div>
          </div>
          <div className="bg-[#161616] border border-[#2d2d2d] rounded-xl p-4">
            <div className="text-[#888] text-xs font-medium mb-1">Events</div>
            <div className="text-2xl font-semibold text-white">{total_events.toLocaleString()}</div>
          </div>
          <div className="bg-[#161616] border border-[#2d2d2d] rounded-xl p-4">
            <div className="text-[#888] text-xs font-medium mb-1">Input tokens</div>
            <div className="text-2xl font-semibold text-white">{formatTokenCount(total_input_tokens)}</div>
          </div>
          <div className="bg-[#161616] border border-[#2d2d2d] rounded-xl p-4">
            <div className="text-[#888] text-xs font-medium mb-1">Output tokens</div>
            <div className="text-2xl font-semibold text-white">{formatTokenCount(total_output_tokens)}</div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex gap-0 mb-4 border-b border-[#2d2d2d]">
          <button
            onClick={() => setView('tokens')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              view === 'tokens'
                ? 'border-[#10a37f] text-white'
                : 'border-transparent text-[#888] hover:text-white'
            }`}
          >
            Token usage
          </button>
          <button
            onClick={() => setView('activity')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              view === 'activity'
                ? 'border-[#10a37f] text-white'
                : 'border-transparent text-[#888] hover:text-white'
            }`}
          >
            Activity
          </button>
        </div>

        {/* Token Usage View */}
        {view === 'tokens' && (
          <div>
            {/* Token Usage Bar Chart */}
            <div className="bg-[#161616] border border-[#2d2d2d] rounded-xl p-5 mb-4">
              <div className="text-sm font-medium text-[#ccc] mb-4">Tokens by model</div>
              <div className="h-[300px] w-full">
                {tokenChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tokenChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        stroke="#666"
                        fontSize={11}
                        angle={-12}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        stroke="#666"
                        fontSize={11}
                        tickFormatter={formatTokenCount}
                      />
                      <RechartsTooltip
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0]?.payload
                            return (
                              <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-3 shadow-xl text-xs min-w-[180px]">
                                <div className="font-semibold text-white mb-2">{d.agent} <span className="text-[#888]">/ {d.model}</span></div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-[#888]">Input</span>
                                  <span className="text-white font-medium">{Number(d.input).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-[#888]">Output</span>
                                  <span className="text-white font-medium">{Number(d.output).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-[#333]">
                                  <span className="text-[#888]">Total</span>
                                  <span className="text-white font-semibold">{Number(d.total).toLocaleString()}</span>
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
                        formatter={(value: string) => <span className="text-[#aaa]">{value}</span>}
                      />
                      <Bar dataKey="input" name="Input" fill="#10a37f" radius={[4, 4, 0, 0]} barSize={20} />
                      <Bar dataKey="output" name="Output" fill="#6e44ff" radius={[4, 4, 0, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-[#555] text-sm">
                    No token usage data available
                  </div>
                )}
              </div>
            </div>

            {/* Token Breakdown Table */}
            <div className="bg-[#161616] border border-[#2d2d2d] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#2d2d2d]">
                <div className="text-sm font-medium text-[#ccc]">Breakdown</div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#888] text-xs border-b border-[#2d2d2d]">
                    <th className="text-left px-5 py-2 font-medium">Agent</th>
                    <th className="text-left px-5 py-2 font-medium">Model</th>
                    <th className="text-right px-5 py-2 font-medium">Input tokens</th>
                    <th className="text-right px-5 py-2 font-medium">Output tokens</th>
                    <th className="text-right px-5 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.agent_usage.map((u, i) => (
                    <tr key={i} className="border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-5 py-3 text-white font-medium">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getModelColor(u.model, i) }} />
                          {u.agent}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[#aaa]">{u.model}</td>
                      <td className="px-5 py-3 text-right text-white font-mono">{u.input.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-white font-mono">{u.output.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-white font-mono font-semibold">{(u.input + u.output).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Activity View */}
        {view === 'activity' && (
          <div>
            {/* Event Timeline */}
            <div className="bg-[#161616] border border-[#2d2d2d] rounded-xl p-5 mb-4">
              <div className="text-sm font-medium text-[#ccc] mb-4">Events over time</div>
              <div className="h-[300px] w-full">
                {timelineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timelineData}>
                      <defs>
                        <linearGradient id="eventGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10a37f" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10a37f" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="localLabel"
                        stroke="#666"
                        fontSize={11}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis stroke="#666" fontSize={11} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                        labelStyle={{ color: '#888', marginBottom: '4px' }}
                        itemStyle={{ color: '#10a37f' }}
                      />
                      <Area type="monotone" dataKey="count" stroke="#10a37f" strokeWidth={2} fill="url(#eventGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-[#555] text-sm">
                    No activity data available
                  </div>
                )}
              </div>
            </div>

            {/* Top Actions */}
            <div className="bg-[#161616] border border-[#2d2d2d] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#2d2d2d]">
                <div className="text-sm font-medium text-[#ccc]">Top actions</div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#888] text-xs border-b border-[#2d2d2d]">
                    <th className="text-left px-5 py-2 font-medium">Action</th>
                    <th className="text-right px-5 py-2 font-medium">Count</th>
                    <th className="text-right px-5 py-2 font-medium w-[40%]">Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {top_actions.map((a, i) => {
                    const maxVal = top_actions[0]?.value || 1
                    const pct = (a.value / maxVal) * 100
                    return (
                      <tr key={i} className="border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors">
                        <td className="px-5 py-3 text-white font-medium">{a.name}</td>
                        <td className="px-5 py-3 text-right text-white font-mono">{a.value.toLocaleString()}</td>
                        <td className="px-5 py-3">
                          <div className="w-full bg-[#1e1e1e] rounded-full h-2">
                            <div className="h-2 rounded-full bg-[#10a37f] transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

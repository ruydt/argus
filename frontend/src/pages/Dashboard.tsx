import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend } from 'recharts'
import { useDashboardStats } from '../hooks/useDashboardStats'

const COLORS = [
  '#3274d9', // Grafana Blue
  '#73bf69', // Grafana Green
  '#f2cc0c', // Grafana Yellow
  '#ef843c', // Grafana Orange
  '#e24d42', // Grafana Red
  '#962d28', // Grafana Dark Red
]

export function Dashboard() {
  const { stats, loading } = useDashboardStats()

  const allModels = useMemo(() => {
    if (!stats) return []
    const models = new Set<string>()
    stats.agent_usage.forEach(u => models.add(u.model))
    return Array.from(models)
  }, [stats])

  const agentUsageData = useMemo(() => {
    if (!stats) return []
    const grouped: Record<string, any> = {}
    stats.agent_usage.forEach(u => {
      if (!grouped[u.agent]) grouped[u.agent] = { name: u.agent }
      grouped[u.agent][`${u.model}_input`] = u.input
      grouped[u.agent][`${u.model}_output`] = u.output
    })
    return Object.values(grouped)
  }, [stats])

  if (loading || !stats) {
    return (
      <div className="flex-1 bg-[#111217] flex items-center justify-center">
        <div className="text-[#3274d9] font-mono animate-pulse">INITIALIZING ANALYTICS TERMINAL...</div>
      </div>
    )
  }

  const { total_sessions, total_events, total_input_tokens, total_output_tokens, timeline, top_actions } = stats


  return (
    <div className="p-4 bg-[#111217] min-h-screen overflow-y-auto flex-1 font-sans">
      {/* Top Header / Toolbar */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#2c3235]">
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 bg-[#3274d9] rounded-full" />
          <h2 className="text-xl font-medium text-[#d8d9da]">Agent Analytics / <span className="text-white font-bold">General Dashboard</span></h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-[#181b1f] border border-[#2c3235] px-3 py-1.5 rounded-sm text-[11px] text-[#ccccdc] font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#73bf69]" />
            LIVE DATA STREAMING
          </div>
          <div className="bg-[#181b1f] border border-[#2c3235] px-3 py-1.5 rounded-sm text-[11px] text-[#ccccdc] font-medium">
            All Time
          </div>
        </div>
      </div>

      {/* KPI Cards (Grafana Stat Panels) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-[#181b1f] border border-[#2c3235] rounded-sm relative overflow-hidden group">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#3274d9]" />
          <div className="p-3">
            <div className="text-[#ccccdc] text-[11px] font-bold uppercase tracking-wider mb-1">Total Sessions</div>
            <div className="text-3xl font-medium text-[#56a4ff]">
              {total_sessions.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="bg-[#181b1f] border border-[#2c3235] rounded-sm relative overflow-hidden group">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#73bf69]" />
          <div className="p-3">
            <div className="text-[#ccccdc] text-[11px] font-bold uppercase tracking-wider mb-1">Total Events</div>
            <div className="text-3xl font-medium text-[#73bf69]">
              {total_events.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="bg-[#181b1f] border border-[#2c3235] rounded-sm relative overflow-hidden group">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#f2cc0c]" />
          <div className="p-3">
            <div className="text-[#ccccdc] text-[11px] font-bold uppercase tracking-wider mb-1">Input Tokens</div>
            <div className="text-3xl font-medium text-[#f2cc0c]">
              {total_input_tokens.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="bg-[#181b1f] border border-[#2c3235] rounded-sm relative overflow-hidden group">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#ef843c]" />
          <div className="p-3">
            <div className="text-[#ccccdc] text-[11px] font-bold uppercase tracking-wider mb-1">Output Tokens</div>
            <div className="text-3xl font-medium text-[#ef843c]">
              {total_output_tokens.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-4">
        {/* Activity Timeline (Grafana Graph Panel) */}
        <div className="bg-[#181b1f] border border-[#2c3235] rounded-sm">
          <div className="px-3 py-2 border-b border-[#2c3235] flex items-center justify-between">
            <span className="text-[#d8d9da] text-[11px] font-bold uppercase tracking-wider">Event Frequency Timeline</span>
          </div>
          <div className="p-4">
            <div className="h-[250px] w-full">
              {timeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00f2ff" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#00f2ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="#444" 
                      fontSize={10} 
                      tickFormatter={(val) => {
                        // "2026-05-05 10:00" -> "10:00"
                        const parts = val.split(' ')
                        return parts[1] || val
                      }} 
                    />
                    <YAxis stroke="#444" fontSize={10} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      contentStyle={{ background: '#050505', border: '1px solid #333', fontSize: '11px', color: '#fff', fontFamily: 'monospace' }}
                      itemStyle={{ color: '#00f2ff' }}
                      labelStyle={{ color: '#888', marginBottom: '4px' }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#00f2ff" strokeWidth={3} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#8e8e8e] text-xs">
                  No data to display
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Action Distribution (Grafana Panel) */}
        <div className="bg-[#181b1f] border border-[#2c3235] rounded-sm">
          <div className="px-3 py-2 border-b border-[#2c3235] flex items-center justify-between">
            <span className="text-[#d8d9da] text-[11px] font-bold uppercase tracking-wider">Top Actions Volume</span>
          </div>
          <div className="p-4">
            <div className="h-[250px] w-full">
              {top_actions.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top_actions} layout="vertical" margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      stroke="#ccc" 
                      fontSize={11} 
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                      contentStyle={{ background: '#050505', border: '1px solid #333', fontSize: '11px', color: '#fff', fontFamily: 'monospace' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(value: any) => [
                        <span className="font-mono font-bold">{value}</span>,
                        'Volume'
                      ]}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {top_actions.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#8e8e8e] text-xs">
                  No data
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Token Usage By Agent (Grafana Panel) */}
        <div className="bg-[#181b1f] border border-[#2c3235] rounded-sm">
          <div className="px-3 py-2 border-b border-[#2c3235] flex items-center justify-between">
            <span className="text-[#d8d9da] text-[11px] font-bold uppercase tracking-wider">Token Distribution by Agent & Model</span>
          </div>
          <div className="p-4">
            <div className="h-[250px] w-full">
              {agentUsageData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentUsageData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      stroke="#8e8e8e" 
                      fontSize={10} 
                    />
                    <YAxis hide />
                    <RechartsTooltip
                      shared={false}
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ background: '#111217', border: '1px solid #2c3235', fontSize: '11px', color: '#d8d9da' }}
                    />
                    <Legend iconType="rect" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                    {allModels.map((model, idx) => (
                      <Bar 
                        key={`${model}_input`}
                        dataKey={`${model}_input`} 
                        name={`${model} (In)`}
                        stackId="input" 
                        fill={COLORS[idx % COLORS.length]} 
                        barSize={30}
                      />
                    ))}
                    {allModels.map((model, idx) => (
                      <Bar 
                        key={`${model}_output`}
                        dataKey={`${model}_output`} 
                        name={`${model} (Out)`}
                        stackId="output" 
                        fill={COLORS[idx % COLORS.length]} 
                        opacity={0.6}
                        barSize={30}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#8e8e8e] text-xs">
                  No data
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

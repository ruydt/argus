import { describe, expect, it } from 'vitest'
import type { DateRange } from 'react-day-picker'
import { buildStatsCsv, statsCsvFilename } from '@/features/dashboard/dashboard-export'
import type { DashboardStats } from '@/features/dashboard/hooks/useDashboardStats'

const range: DateRange = {
  from: new Date('2026-06-01T00:00:00Z'),
  to: new Date('2026-06-13T00:00:00Z'),
}

const stats: DashboardStats = {
  total_sessions: 2,
  total_events: 42,
  total_input_tokens: 1000,
  total_output_tokens: 500,
  timeline_granularity: 'day',
  timeline: [{ date: '2026-06-01', count: 5 }],
  timeline_by_agent: [],
  token_timeline: [],
  token_timeline_by_agent: [],
  top_actions: [{ name: 'Bash, with comma', value: 7 }],
  agent_usage: [],
  session_usage: [
    {
      session_id: 's1',
      agent: 'claudecode',
      provider: 'anthropic',
      model: 'opus',
      started_at: '2026-06-01T00:00:00Z',
      last_seen_at: '2026-06-01T01:00:00Z',
      input: 100,
      output: 50,
      models: [],
    },
    {
      session_id: 's2',
      agent: 'codex',
      provider: 'openai',
      model: 'gpt-5.5',
      started_at: '2026-06-02T00:00:00Z',
      last_seen_at: '2026-06-02T02:00:00Z',
      input: 200,
      output: 80,
      models: [],
    },
  ],
}

describe('buildStatsCsv', () => {
  it('emits one header row plus one row per session', () => {
    const lines = buildStatsCsv(stats).trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(
      'Session ID,Agent,Provider,Model,Started At,Last Seen At,Input Tokens,Output Tokens'
    )
  })

  it('writes session values in order', () => {
    const csv = buildStatsCsv(stats)
    expect(csv).toContain(
      's1,claudecode,anthropic,opus,2026-06-01T00:00:00Z,2026-06-01T01:00:00Z,100,50'
    )
    expect(csv).toContain(
      's2,codex,openai,gpt-5.5,2026-06-02T00:00:00Z,2026-06-02T02:00:00Z,200,80'
    )
  })

  it('quotes cells containing commas', () => {
    const withComma: DashboardStats = {
      ...stats,
      session_usage: [{ ...stats.session_usage[0], model: 'opus, 1m' }],
    }
    expect(buildStatsCsv(withComma)).toContain('"opus, 1m"')
  })

  it('emits only a header when no sessions', () => {
    const empty: DashboardStats = { ...stats, session_usage: [] }
    expect(buildStatsCsv(empty).trim().split('\n')).toHaveLength(1)
  })
})

describe('statsCsvFilename', () => {
  it('builds a dated filename', () => {
    expect(statsCsvFilename(range)).toBe('argus-sessions-20260601-20260613.csv')
  })

  it('falls back when range is empty', () => {
    expect(statsCsvFilename({})).toBe('argus-sessions-all-all.csv')
  })
})

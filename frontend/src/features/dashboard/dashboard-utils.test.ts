import { describe, expect, it } from 'vitest'
import { toTokenShareChartData } from './dashboard-utils'

describe('toTokenShareChartData', () => {
  it('builds one stacked total row with provider/model slices', () => {
    const chart = toTokenShareChartData({
      total_sessions: 2,
      total_events: 10,
      total_input_tokens: 75,
      total_output_tokens: 25,
      timeline: [],
      top_actions: [],
      agent_usage: [
        {
          provider: 'openai',
          agent: 'codex',
          model: 'gpt-5.5',
          input: 45,
          output: 15,
        },
        {
          provider: 'anthropic',
          agent: 'claudecode',
          model: 'claude-sonnet-4-6',
          input: 30,
          output: 10,
        },
      ],
      session_usage: [],
    })

    expect(chart.total).toBe(100)
    expect(chart.data).toEqual([
      {
        label: 'Total tokens',
        share_0: 60,
        share_1: 40,
      },
    ])
    expect(chart.series).toEqual([
      {
        key: 'share_0',
        label: 'OpenAI / gpt-5.5',
        provider: 'openai',
        model: 'gpt-5.5',
        total: 60,
      },
      {
        key: 'share_1',
        label: 'Anthropic / claude-sonnet-4-6',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        total: 40,
      },
    ])
  })

  it('returns empty chart shape when no usage exists', () => {
    const chart = toTokenShareChartData({
      total_sessions: 0,
      total_events: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      timeline: [],
      top_actions: [],
      agent_usage: [],
      session_usage: [],
    })

    expect(chart.total).toBe(0)
    expect(chart.data).toEqual([])
    expect(chart.series).toEqual([])
  })
})

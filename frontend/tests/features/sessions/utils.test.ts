import { describe, expect, it } from 'vitest'
import type { Session } from '@/types/sessions'
import { formatTimeAxis, isRunning, sessionDurationMs, shortenCwd } from '@/features/sessions/utils'

const NOW = new Date('2026-05-13T12:00:00Z').getTime()

function session(overrides: Partial<Session> = {}): Session {
  return {
    session_id: 's1',
    agent: 'codex',
    model: 'gpt-5.4',
    source: 'startup',
    cwd: '/tmp',
    transcript_path: '/tmp/a',
    started_at: '2026-05-13T11:59:00Z',
    last_seen_at: '2026-05-13T11:59:58Z',
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      turns: 0,
    },
    ...overrides,
  }
}

describe('sessions utils', () => {
  it('sessionDurationMs returns 0 for invalid started_at', () => {
    const ms = sessionDurationMs(session({ started_at: '' }), NOW)
    expect(ms).toBe(0)
  })

  it('sessionDurationMs returns 0 for invalid last_seen_at on finished sessions', () => {
    const ms = sessionDurationMs(
      session({
        started_at: '2026-05-13T11:00:00Z',
        last_seen_at: '',
      }),
      NOW
    )
    expect(ms).toBe(0)
  })

  it('isRunning returns false for invalid last_seen_at', () => {
    expect(isRunning(session({ last_seen_at: '' }), NOW)).toBe(false)
  })

  it('isRunning returns false when ended_at exists even if last_seen is recent', () => {
    expect(
      isRunning(
        session({
          last_seen_at: '2026-05-13T11:59:59Z',
          ended_at: '2026-05-13T11:59:59Z',
        }),
        NOW
      )
    ).toBe(false)
  })

  it('sessionDurationMs ends at ended_at when present', () => {
    const ms = sessionDurationMs(
      session({
        started_at: '2026-05-13T11:00:00Z',
        last_seen_at: '2026-05-13T12:30:00Z',
        ended_at: '2026-05-13T11:30:00Z',
      }),
      NOW
    )
    expect(ms).toBe(30 * 60 * 1000)
  })
})

describe('formatTimeAxis', () => {
  it('shows seconds for sub-minute durations', () => {
    expect(formatTimeAxis(0)).toBe('0s')
    expect(formatTimeAxis(30_000)).toBe('30s')
    expect(formatTimeAxis(59_000)).toBe('59s')
  })

  it('shows minutes for sub-hour durations', () => {
    expect(formatTimeAxis(60_000)).toBe('1m')
    expect(formatTimeAxis(90_000)).toBe('1m 30s')
    expect(formatTimeAxis(3_540_000)).toBe('59m')
  })

  it('shows hours for long durations', () => {
    expect(formatTimeAxis(3_600_000)).toBe('1h')
    expect(formatTimeAxis(5_400_000)).toBe('1h 30m')
    expect(formatTimeAxis(14_256_000)).toBe('3h 57m')
  })

  it('does NOT produce colon-separated output like 236:36', () => {
    const ms = (236 * 60 + 36) * 1_000
    expect(formatTimeAxis(ms)).not.toMatch(/^\d+:\d+$/)
    expect(formatTimeAxis(ms)).toBe('3h 56m')
  })
})

describe('shortenCwd', () => {
  it('replaces macOS home prefix with ~', () => {
    expect(shortenCwd('/Users/duytran/projects/argus')).toBe('~/projects/argus')
  })

  it('replaces Linux home prefix with ~', () => {
    expect(shortenCwd('/home/ubuntu/projects')).toBe('~/projects')
  })

  it('leaves non-home paths unchanged', () => {
    expect(shortenCwd('/tmp/work')).toBe('/tmp/work')
    expect(shortenCwd('/var/app')).toBe('/var/app')
  })

  it('handles empty string', () => {
    expect(shortenCwd('')).toBe('')
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IgnoreRulesPanel } from '@/features/diagnostics/IgnoreRulesPanel'
import type { DiagnosticsIgnoreFile } from '@/features/diagnostics/types'

const withRules: DiagnosticsIgnoreFile = {
  path: '/home/user/.config/argus/ignore',
  status: 'loaded',
  activePatternCount: 3,
  rules: [
    { pattern: 'node_modules/', line: 1, negate: false },
    { pattern: '*.env', line: 2, negate: false },
    { pattern: '!important.env', line: 3, negate: true },
  ],
}

const empty: DiagnosticsIgnoreFile = {
  path: '/home/user/.config/argus/ignore',
  status: 'missing_ok',
  activePatternCount: 0,
  rules: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('IgnoreRulesPanel', () => {
  it('lists active rules with line numbers, a negate badge, and the file path', () => {
    render(<IgnoreRulesPanel ignoreFile={withRules} />)
    expect(screen.getByText('node_modules/')).toBeInTheDocument()
    expect(screen.getByText('*.env')).toBeInTheDocument()
    expect(screen.getByText('!important.env')).toBeInTheDocument()
    expect(screen.getByText('negate')).toBeInTheDocument()
    expect(screen.getByText('3 active')).toBeInTheDocument()
    expect(screen.getAllByText('/home/user/.config/argus/ignore').length).toBeGreaterThan(0)
  })

  it('shows an empty state when there are no rules', () => {
    render(<IgnoreRulesPanel ignoreFile={empty} />)
    expect(screen.getByText(/No ignore rules configured/i)).toBeInTheDocument()
    expect(screen.queryByText('node_modules/')).not.toBeInTheDocument()
  })

  it('tests a path and shows the ignored verdict with the matched rule', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ignored: true, reason: 'pattern "*.env" (line 2)' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<IgnoreRulesPanel ignoreFile={withRules} />)
    fireEvent.change(screen.getByLabelText(/test a path/i), {
      target: { value: '/home/me/project/.env' },
    })
    fireEvent.click(screen.getByRole('button', { name: /check/i }))

    expect(await screen.findByText(/Ignored/)).toBeInTheDocument()
    expect(screen.getByText(/pattern "\*\.env" \(line 2\)/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/diagnostics/ignore-test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: '/home/me/project/.env' }),
      })
    )
  })

  it('shows the not-ignored verdict when the path is not matched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ignored: false, reason: '' }) })
    )

    render(<IgnoreRulesPanel ignoreFile={withRules} />)
    fireEvent.change(screen.getByLabelText(/test a path/i), {
      target: { value: '/home/me/main.go' },
    })
    fireEvent.click(screen.getByRole('button', { name: /check/i }))

    expect(await screen.findByText(/Not ignored/i)).toBeInTheDocument()
  })
})

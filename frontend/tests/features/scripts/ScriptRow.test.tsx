import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ScriptRow } from '@/features/scripts/ScriptRow'
import type { ScriptPackage } from '@/types'

const base: ScriptPackage = {
  id: 'block-dangerous',
  filename: 'block-dangerous.js',
  version: '1.0.0',
  title: 'Block dangerous commands',
  purpose: 'Deny dangerous shell commands.',
  event: 'PreToolUse',
  matcher: 'Bash',
  runtime: 'node',
  agents: ['claude-code'],
  author: 'argus',
  source: 'https://example.com',
  tier: 'official',
  checksum: 'sha256:abc',
  body: 'console.log(1)',
  installed: false,
  runtime_available: true,
}

describe('ScriptRow', () => {
  it('shows Install when available and fires onInstall', () => {
    const onInstall = vi.fn()
    render(
      <ScriptRow script={base} index={1} onInstall={onInstall} onDelete={vi.fn()} busy={false} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(onInstall).toHaveBeenCalledWith('block-dangerous')
  })

  it('shows a static Installed label (no Delete) when installed and canDelete is false', () => {
    render(
      <ScriptRow
        script={{ ...base, installed: true }}
        index={1}
        onInstall={vi.fn()}
        onDelete={vi.fn()}
        busy={false}
      />
    )
    expect(screen.getByText('Installed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('shows Delete when installed and canDelete is true', () => {
    const onDelete = vi.fn()
    render(
      <ScriptRow
        script={{ ...base, installed: true }}
        index={1}
        canDelete
        onInstall={vi.fn()}
        onDelete={onDelete}
        busy={false}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('block-dangerous')
  })

  it('warns when runtime missing', () => {
    render(
      <ScriptRow
        script={{ ...base, runtime_available: false }}
        index={1}
        onInstall={vi.fn()}
        onDelete={vi.fn()}
        busy={false}
      />
    )
    expect(screen.getByText(/needs node/i)).toBeInTheDocument()
  })
})

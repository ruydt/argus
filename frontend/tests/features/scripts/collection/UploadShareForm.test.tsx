import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { UploadShareForm } from '@/features/scripts/collection/UploadShareForm'

beforeAll(() => {
  // jsdom shims Radix Dialog/Select may touch
  Element.prototype.scrollIntoView = vi.fn()
  // @ts-expect-error jsdom shim
  Element.prototype.hasPointerCapture = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

const HEADED = [
  '// @argus-meta',
  '// title: Demo',
  '// event: Stop',
  '// runtime: node',
  '// @end',
  '',
  'console.log(1)',
  '',
].join('\n')

describe('UploadShareForm', () => {
  it('walks a headed file to the description step and submits injected bodies', () => {
    const onSubmit = vi.fn()
    render(
      <UploadShareForm
        files={[{ name: 'demo.js', body: HEADED }]}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    )
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Demo')
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /pull request description/i }), {
      target: { value: 'my desc' },
    })
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [outFiles, description] = onSubmit.mock.calls[0]
    expect(description).toBe('my desc')
    expect(outFiles[0].name).toBe('demo.js')
    expect(outFiles[0].body).toContain('// @argus-meta')
    expect(outFiles[0].body).toContain('// title: Demo')
    expect(outFiles[0].body.match(/\/\/ @argus-meta/g).length).toBe(1)
  })

  it('disables Next until required fields are present (headerless file)', () => {
    render(
      <UploadShareForm
        files={[{ name: 'x.js', body: 'console.log(1)\n' }]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })
})

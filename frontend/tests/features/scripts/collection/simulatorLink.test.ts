import { describe, expect, it } from 'vitest'

import { simulatorPath } from '@/features/scripts/collection/simulatorLink'

describe('simulatorPath', () => {
  it('includes view, script, and event when event is present', () => {
    const p = simulatorPath({
      id: 'a',
      filename: 'a.js',
      title: 'A',
      event: 'Stop',
      local: true,
      gist: false,
    })
    expect(p).toBe('/hooks-config?view=simulator&script=a.js&event=Stop')
  })

  it('omits event when absent', () => {
    const p = simulatorPath({ id: 'b', filename: 'b.js', title: 'B', local: true, gist: false })
    expect(p).toBe('/hooks-config?view=simulator&script=b.js')
  })
})

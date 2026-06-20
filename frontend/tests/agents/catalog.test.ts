import { describe, expect, it } from 'vitest'
import { AGENT_CATALOG } from '@/agents/catalog'
import { AGENT_LOGOS } from '@/agents/logos'

describe('agent catalog logos', () => {
  it('uses the shared logo module for every catalog agent', () => {
    for (const [id, meta] of Object.entries(AGENT_CATALOG)) {
      expect(meta.Logo, id).toBe(AGENT_LOGOS[id])
    }
  })
})

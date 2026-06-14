import { useState } from 'react'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { CommunityTab } from './community/CommunityTab'
import { CollectionTab } from './collection/CollectionTab'

type Tab = 'community' | 'collection'

const TAB_KEY = 'argus:scripts-tab'

function readTab(): Tab {
  try {
    return sessionStorage.getItem(TAB_KEY) === 'collection' ? 'collection' : 'community'
  } catch {
    return 'community'
  }
}

export function ScriptsPage() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>(readTab)

  function changeTab(next: Tab) {
    setTab(next)
    try {
      sessionStorage.setItem(TAB_KEY, next)
    } catch {
      // ignore storage failures
    }
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#666]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scripts…"
              aria-label="Search scripts"
              className="pl-9"
            />
          </div>

          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(v) => v && changeTab(v as Tab)}
            className="justify-start"
          >
            <ToggleGroupItem value="community">Community</ToggleGroupItem>
            <ToggleGroupItem value="collection">My Collection</ToggleGroupItem>
          </ToggleGroup>

          {tab === 'community' ? <CommunityTab query={query} /> : <CollectionTab query={query} />}
        </div>
      </main>
    </div>
  )
}

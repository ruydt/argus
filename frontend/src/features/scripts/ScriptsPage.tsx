import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'

import { PageHeader, PageShell } from '@/components/shared/PageShell'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { CommunityTab } from './community/CommunityTab'
import { CollectionTab } from './collection/CollectionTab'
import { AccountMenu } from './collection/AccountMenu'
import { useCollection } from './collection/useCollection'
import { useCommunity } from './community/useCommunity'

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
  const searchRef = useRef<HTMLInputElement | null>(null)
  const collection = useCollection()
  const community = useCommunity()

  function changeTab(next: Tab) {
    if (next === tab) return
    setTab(next)
    try {
      sessionStorage.setItem(TAB_KEY, next)
    } catch {
      // ignore storage failures
    }
    // Switching between the two tabs revalidates the tab you land on. (Leaving
    // the page and coming back does NOT — that path reuses the session cache.)
    void (next === 'community' ? community.reload() : collection.reload())
  }

  // `/` focuses search, matching the leaderboard-style hotkey hint.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      const tag = el?.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (el as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <PageShell>
      <PageHeader
        title="Scripts"
        subtitle={
          <a
            href="https://github.com/ruydt/argus/tree/main/registry"
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3" />
            View the registry
          </a>
        }
        actions={<AccountMenu collection={collection} />}
      />

      <div className="flex items-center gap-3 border-b border-foreground/[0.12] pb-3">
        <Search className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search scripts..."
          aria-label="Search scripts"
          className="min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      <div className="space-y-6">
        <Tabs value={tab} onValueChange={(v) => changeTab(v as Tab)} data-tour="scripts-tabs">
          <TabsList variant="line">
            <TabsTrigger value="community" data-tour="scripts-tab-community">
              Community
            </TabsTrigger>
            <TabsTrigger value="collection" data-tour="scripts-tab-collection">
              My Collection
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div data-tour="scripts-content">
          {tab === 'community' ? (
            <CommunityTab query={query} community={community} />
          ) : (
            <CollectionTab query={query} collection={collection} />
          )}
        </div>
      </div>
    </PageShell>
  )
}

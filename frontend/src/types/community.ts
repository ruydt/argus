export type CommunityScript = {
  id: string
  author: string
  title: string
  purpose?: string
  event?: string
  matcher?: string
  runtime?: string
  command?: string
  os?: string
  tier: 'community'
  sha256: string
  source: string
  published_at?: string
  installed: boolean
  runtime_available: boolean
}

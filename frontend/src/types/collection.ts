export type CollectionScript = {
  id: string
  filename: string
  title: string
  purpose?: string
  event?: string
  matcher?: string
  runtime?: string
  origin: 'bundled' | 'local'
  body: string
  installed: boolean
}

export type Collection = {
  scripts: CollectionScript[]
  gist_url?: string
}

export type GitHubAuthStatus = {
  authenticated: boolean
  login?: string
}

export type DeviceCodeResponse = {
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export type CollectionEntry = {
  id: string
  filename: string
  title: string
  author?: string
  event?: string
  runtime?: string
  local: boolean
  gist: boolean
}

export type CollectionView = {
  authenticated: boolean
  login?: string
  gist_url?: string
  entries: CollectionEntry[]
}

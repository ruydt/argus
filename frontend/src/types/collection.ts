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
  events?: string[]
  agents?: string[]
  runtime?: string
  os?: string
  local: boolean
  gist: boolean
}

export type CollectionView = {
  authenticated: boolean
  login?: string
  gist_url?: string
  entries: CollectionEntry[]
}

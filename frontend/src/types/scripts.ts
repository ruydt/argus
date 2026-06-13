export type ScriptPackage = {
  id: string
  filename: string
  version: string
  title: string
  purpose: string
  event: string
  matcher?: string
  runtime: string
  agents: string[]
  author: string
  source: string
  tier: string
  checksum: string
  body: string
  installed: boolean
  runtime_available: boolean
}

export type ScriptBundle = {
  id: string
  title: string
  description: string
  packages: string[]
}

export type ScriptCatalog = {
  packages: ScriptPackage[]
  bundles: ScriptBundle[]
}

export type BundleInstallResult = {
  id: string
  status: 'installed' | 'skipped' | 'error'
}

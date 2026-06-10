export interface DiagnosticsVersion {
  version: string
  commit: string
  buildDate: string
}

export interface DiagnosticsHealth {
  live: boolean
  ready: boolean
  reason?: string
}

export interface DiagnosticsStorage {
  dbPath: string
  dbSizeBytes: number | null
  dbSizeReason?: string
  totalEvents: number
  totalSessions: number
  latestEventAt: string | null
}

export interface DiagnosticsRuntime {
  startedAt: string
  uptimeSeconds: number
  hookRequests: number
  ingestionErrors: number
}

export interface DiagnosticsDBHealth {
  journalMode: string
  pageCount: number
  pageSizeBytes: number
  walSizeBytes: number | null
  migrationVersion: number
}

export interface DiagnosticsAgent {
  id: string
  label: string
  eventCount: number
  lastSeenAt: string | null
  degradedCount: number
  normalizerVersion: string | null
  hookConfigStatus: string
  hookConfigReason?: string
  status: string
  warnings: string[]
  eventsLastHour: number
  eventsLast24h: number
}

export interface DiagnosticsIgnoreFile {
  path: string
  status: string
  activePatternCount: number
}

export interface DiagnosticsPrivacy {
  ignoreFile: DiagnosticsIgnoreFile
  exportWarning: string
}

export interface DiagnosticsRemoteBind {
  addr: string
  status: string
  allowRemote: boolean
}

export interface DiagnosticsCORS {
  totalOrigins: number
  localOrigins: number
  extraOrigins: number
}

export interface DiagnosticsSecurity {
  remoteBind: DiagnosticsRemoteBind
  cors: DiagnosticsCORS
}

export interface DiagnosticsFileEntry {
  name: string
  path: string
  sizeBytes: number | null
  lastModified: string | null
  exists: boolean
  lineCount?: number | null
}

export interface DiagnosticsFileSystem {
  argusDir: string
  binary: DiagnosticsFileEntry
  logs: DiagnosticsFileEntry[]
  hooks: DiagnosticsFileEntry[]
  claudeDir: string
  claudeDirExists: boolean
  claudeHooks: DiagnosticsFileEntry[]
  claudeHooksDirExists: boolean
  claudeHistory: DiagnosticsFileEntry
  codexDir: string
  codexDirExists: boolean
  codexHooks: DiagnosticsFileEntry[]
  codexHooksDirExists: boolean
  codexDBs: DiagnosticsFileEntry[]
  codexDBsDirExists: boolean
}

export interface Diagnostics {
  version: DiagnosticsVersion
  health: DiagnosticsHealth
  storage: DiagnosticsStorage
  agents: DiagnosticsAgent[]
  privacy: DiagnosticsPrivacy
  security: DiagnosticsSecurity
  fileSystem: DiagnosticsFileSystem
  runtime: DiagnosticsRuntime
  dbHealth: DiagnosticsDBHealth
}

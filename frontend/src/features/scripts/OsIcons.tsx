import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// OS support is a single registry token. Map it to the platforms it covers, in a
// stable Linux → macOS → Windows order. 'both' (or anything unrecognised) means
// cross-platform; 'posix' is macOS + Linux (shell/CLI tools, not Windows).
const OS_PLATFORMS: Record<string, Platform[]> = {
  both: ['linux', 'macos', 'windows'],
  posix: ['linux', 'macos'],
  macos: ['macos'],
  windows: ['windows'],
  linux: ['linux'],
}

type Platform = 'linux' | 'macos' | 'windows'

const PLATFORM_LABEL: Record<Platform, string> = {
  linux: 'Linux',
  macos: 'macOS',
  windows: 'Windows',
}

function platformsFor(os?: string): Platform[] {
  return OS_PLATFORMS[os ?? 'both'] ?? OS_PLATFORMS.both
}

function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M16.36 12.78c-.02-2.16 1.76-3.2 1.84-3.25-1-1.47-2.56-1.67-3.12-1.69-1.33-.13-2.59.78-3.26.78-.67 0-1.71-.76-2.81-.74-1.45.02-2.78.84-3.52 2.14-1.5 2.6-.38 6.45 1.08 8.56.71 1.03 1.56 2.19 2.67 2.15 1.07-.04 1.47-.69 2.77-.69 1.29 0 1.66.69 2.79.67 1.15-.02 1.88-1.05 2.59-2.09.81-1.2 1.15-2.36 1.17-2.42-.03-.01-2.24-.86-2.26-3.41zM14.2 6.24c.59-.72.99-1.71.88-2.7-.85.03-1.88.57-2.49 1.28-.55.63-1.03 1.64-.9 2.61.95.07 1.92-.48 2.51-1.19z" />
    </svg>
  )
}

function WindowsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 5.1 10.4 4v7.3H3V5.1zm0 13.8 7.4 1.1v-7.2H3v6.1zM11.2 3.9 21 2.5v8.8h-9.8V3.9zm0 16.2L21 21.5v-8.7h-9.8v7.3z" />
    </svg>
  )
}

function LinuxMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.5 2c-1.9 0-3 1.6-3 3.4 0 .9.2 1.5.3 2.3.1.6-.3 1.1-.7 1.7-1 1.3-2.3 2.7-3.1 4.2-.5 1-.9 2-.9 2.9 0 .5.2 1 .6 1.3-.2.5-.3 1-.1 1.4.3.6 1 .8 1.7.9.6.1 1.2.3 1.8.6.5.3 1 .6 1.6.6.5 0 .9-.2 1.2-.6.4 0 .8 0 1.2.1.4-.1.8-.1 1.2-.1.3.4.7.6 1.2.6.6 0 1.1-.3 1.6-.6.6-.3 1.2-.5 1.8-.6.7-.1 1.4-.3 1.7-.9.2-.4.1-.9-.1-1.4.4-.3.6-.8.6-1.3 0-.9-.4-1.9-.9-2.9-.8-1.5-2.1-2.9-3.1-4.2-.4-.6-.8-1.1-.7-1.7.1-.8.3-1.4.3-2.3 0-1.8-1.1-3.4-3-3.4zm-1.6 4.2c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9zm3.2 0c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9z" />
    </svg>
  )
}

const MARKS = {
  linux: LinuxMark,
  macos: AppleMark,
  windows: WindowsMark,
} as const

export type OsIconsProps = {
  os?: string
  className?: string
}

// OsIcons renders one small monochrome mark per supported platform, each with a
// tooltip naming the OS.
export function OsIcons({ os, className }: OsIconsProps) {
  const platforms = platformsFor(os)
  return (
    <TooltipProvider delayDuration={100}>
      <span className={`flex items-center gap-1.5 text-muted-foreground ${className ?? ''}`}>
        {platforms.map((p) => {
          const Mark = MARKS[p]
          return (
            <Tooltip key={p}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Mark className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{PLATFORM_LABEL[p]}</TooltipContent>
            </Tooltip>
          )
        })}
      </span>
    </TooltipProvider>
  )
}

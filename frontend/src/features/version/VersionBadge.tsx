import { useVersion } from './useVersion'

export function VersionBadge() {
  const info = useVersion()
  if (!info) return null

  const short = info.commit !== 'none' ? info.commit.slice(0, 7) : null
  const label = short ? `v${info.version} (${short})` : `v${info.version}`

  return (
    <span
      className="whitespace-nowrap text-[0.66rem] font-medium leading-none text-[#444]"
      aria-label={`Application version: ${label}`}
    >
      {label}
    </span>
  )
}

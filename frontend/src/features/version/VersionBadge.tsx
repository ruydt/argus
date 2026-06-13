import { useVersion } from './useVersion'

export function VersionBadge() {
  const info = useVersion()
  if (!info) return null

  // Show the version verbatim: a release built on a tag reads clean (v0.1.2),
  // while a dev build (make build-local) keeps git-describe's commit suffix
  // (v0.1.2-29-g021a77e) so the running build is identifiable.
  const label = info.version.startsWith('v') ? info.version : `v${info.version}`

  return (
    <span
      className="whitespace-nowrap text-[0.66rem] font-medium leading-none text-[#444]"
      aria-label={`Application version: ${label}`}
    >
      {label}
    </span>
  )
}

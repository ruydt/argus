import { useEffect, useState } from 'react'

type VersionInfo = {
  version: string
  commit: string
  buildDate: string
}

export function useVersion(): VersionInfo | null {
  const [info, setInfo] = useState<VersionInfo | null>(null)

  useEffect(() => {
    let mounted = true

    fetch('/api/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VersionInfo | null) => {
        if (mounted && d) setInfo(d)
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [])

  return info
}

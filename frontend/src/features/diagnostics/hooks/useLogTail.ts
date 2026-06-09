import { useCallback, useState } from 'react'

type LogFile = 'hooker' | 'build' | 'hook-scripts'

type State = {
  lines: string[]
  loading: boolean
  error: string | null
}

export function useLogTail(file: LogFile, lines = 50) {
  const [state, setState] = useState<State>({ lines: [], loading: false, error: null })

  const fetchLog = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const r = await fetch(`/api/diagnostics/log-tail?file=${file}&lines=${lines}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as { file: string; lines: string[] }
      setState({ lines: data.lines, loading: false, error: null })
    } catch {
      setState({ lines: [], loading: false, error: 'Failed to load log' })
    }
  }, [file, lines])

  const clear = useCallback(() => {
    setState({ lines: [], loading: false, error: null })
  }, [])

  return { ...state, fetch: fetchLog, clear }
}

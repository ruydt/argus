import { useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { DiagnosticsIgnoreFile } from './types'

type IgnoreCheckResult = { ignored: boolean; reason: string }

type IgnoreRulesPanelProps = {
  ignoreFile: DiagnosticsIgnoreFile
}

// IgnoreRulesPanel surfaces the active privacy ignore rules (read-only) and lets the
// user test whether a given path would be excluded from capture. The verdict comes
// from the same matcher the ingest path uses (POST /api/diagnostics/ignore-test).
export function IgnoreRulesPanel({ ignoreFile }: IgnoreRulesPanelProps) {
  const [path, setPath] = useState('')
  const [result, setResult] = useState<IgnoreCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rules = ignoreFile.rules ?? []

  const check = async () => {
    const trimmed = path.trim()
    if (!trimmed) return
    setChecking(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/diagnostics/ignore-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as IgnoreCheckResult
      setResult(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    check()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy — Ignore Rules</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <span>{rules.length} active</span>
          <code className="truncate font-mono">{ignoreFile.path}</code>
        </div>

        {rules.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No ignore rules configured. Add gitignore-style patterns to{' '}
            <code className="font-mono">{ignoreFile.path}</code> to exclude paths from capture.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rules.map((rule) => (
              <li
                key={`${rule.line}-${rule.pattern}`}
                className="flex items-center gap-2 text-[12px]"
              >
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                  {rule.line}
                </span>
                <code className="font-mono">{rule.pattern}</code>
                {rule.negate && (
                  <Badge variant="outline" className="text-[10px]">
                    negate
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-2 pt-1">
          <label htmlFor="ignore-test-path" className="text-[12px] text-muted-foreground">
            Test a path against these rules
          </label>
          <div className="flex gap-2">
            <Input
              id="ignore-test-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/home/me/project/.env"
              className="font-mono text-[12px]"
            />
            <Button type="submit" variant="outline" size="sm" disabled={checking || !path.trim()}>
              {checking ? 'Checking…' : 'Check'}
            </Button>
          </div>
          {result && (
            <p className="text-[12px]">
              {result.ignored ? (
                <span className="text-[var(--destructive)]">
                  Ignored{result.reason ? ` — ${result.reason}` : ''}
                </span>
              ) : (
                <span className="text-[var(--worktree)]">
                  Not ignored — this path would be captured
                </span>
              )}
            </p>
          )}
          {error && <p className="text-[12px] text-[var(--destructive)]">Check failed: {error}</p>}
        </form>
      </CardContent>
    </Card>
  )
}

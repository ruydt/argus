type PatchRow = {
  kind: 'ctx' | 'add' | 'del'
  num: number
  text: string
}

function parseApplyPatch(text: string, initialLine = 1): PatchRow[] {
  const lines = text.split('\n')
  const out: PatchRow[] = []
  let oldLine = initialLine
  let newLine = initialLine
  let inPatch = false

  for (const line of lines) {
    if (line.startsWith('*** Begin Patch')) {
      inPatch = true
      continue
    }
    if (!inPatch) continue
    if (line.startsWith('*** End Patch')) break

    if (line.includes('@@')) {
      const m = line.match(/@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)/)
      if (m) {
        oldLine = Number(m[1])
        newLine = Number(m[2])
      }
      continue
    }
    if (line.startsWith('***')) continue

    const match = line.match(/^(\s*)([-+ ])(.*)$/)
    if (!match) continue
    const [, indent, marker, content] = match

    if (marker === '-') {
      out.push({ kind: 'del', num: oldLine, text: indent + content })
      oldLine++
    } else if (marker === '+') {
      out.push({ kind: 'add', num: newLine, text: indent + content })
      newLine++
    } else if (marker === ' ') {
      out.push({ kind: 'ctx', num: oldLine, text: indent + content })
      oldLine++
      newLine++
    }
  }
  return out
}

type PatchBlockProps = {
  text: string
  startLine?: number
}

export function PatchBlock({ text, startLine = 1 }: PatchBlockProps) {
  const rows = parseApplyPatch(text, startLine)
  if (rows.length === 0) return null

  return (
    <div className="diff-block">
      {rows.map((r, i) => (
        <div
          key={`p-${i}`}
          className={`diff-line ${r.kind === 'add' ? 'diff-added' : r.kind === 'del' ? 'diff-removed' : 'diff-ctx'}`}
        >
          <span className="diff-ln">{r.num}</span>
          <span className="diff-marker">
            {r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ' '}
          </span>
          <span className="diff-content">{r.text}</span>
        </div>
      ))}
    </div>
  )
}

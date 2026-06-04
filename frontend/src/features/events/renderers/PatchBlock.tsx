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
    const trimmedLine = line.trim()
    if (trimmedLine.startsWith('*** Begin Patch')) {
      inPatch = true
      continue
    }
    if (!inPatch) continue
    if (trimmedLine.startsWith('*** End Patch')) break

    // Very robust @@ header detection
    if (trimmedLine.startsWith('@@')) {
      const m = trimmedLine.match(/@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)/)
      if (m) {
        oldLine = Number(m[1])
        newLine = Number(m[2])
      }
      if (out.length > 0) {
        // Only add separator if the previous row wasn't already a separator
        if (out[out.length - 1].text !== '...') {
          out.push({ kind: 'ctx', num: 0, text: '...' })
        }
      }
      continue
    }
    if (trimmedLine.startsWith('***')) continue

    // Robust marker and line number extraction:
    const match = line.match(/^(\s*)(\d*\s*)([-+ ])(\s*)(\d*\s*)(.*)$/)
    if (!match) continue
    const [, , preNum, marker, , postNum, content] = match

    const rawNum = (preNum || postNum).trim()
    let currentNum = marker === '+' ? newLine : oldLine
    if (rawNum) {
      const parsed = Number(rawNum)
      if (!isNaN(parsed)) currentNum = parsed
    }

    if (marker === '-') {
      out.push({ kind: 'del', num: currentNum, text: content })
      oldLine++
      newLine++ // Keep display in sync for single-column view
    } else if (marker === '+') {
      out.push({ kind: 'add', num: currentNum, text: content })
      newLine++
      oldLine++ // Keep display in sync for single-column view
    } else if (marker === ' ') {
      out.push({ kind: 'ctx', num: currentNum, text: content })
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
          key={`p-${r.num > 0 ? r.num : 'sep'}-${r.kind}-${i}`}
          className={`diff-line ${r.kind === 'add' ? 'diff-added' : r.kind === 'del' ? 'diff-removed' : 'diff-ctx'} ${r.text === '...' ? 'diff-hunk-sep' : ''}`}
        >
          <span className="diff-ln">{r.num > 0 ? r.num : ''}</span>
          <span className="diff-marker">
            {r.text === '...' ? '' : r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ' '}
          </span>
          <span className="diff-content" style={{ opacity: r.text === '...' ? 0.4 : 1 }}>
            {r.text}
          </span>
        </div>
      ))}
    </div>
  )
}

export type PublishScript = {
  id: string
  title: string
  purpose?: string
  event?: string
  matcher?: string
  runtime?: string
  body: string
}

const REGISTRY_NEW_FILE = 'https://github.com/argus-hooks/registry/new/main'
// GitHub's prefill query param overflows past ~8KB; stay well under.
const PREFILL_LIMIT = 6000

export function buildMetaHeader(s: PublishScript): string {
  const lines = [
    '// @argus-meta',
    `// title: ${s.title}`,
    `// event: ${s.event ?? ''}`,
    `// runtime: ${s.runtime ?? 'node'}`,
  ]
  if (s.matcher) lines.push(`// matcher: ${s.matcher}`)
  if (s.purpose) lines.push(`// purpose: ${s.purpose}`)
  lines.push('// @end', '')
  return lines.join('\n')
}

export function buildPublishUrl(
  login: string,
  s: PublishScript
): { url: string; prefilled: boolean } {
  const filename = `scripts/${login}/${s.id}.js`
  const body = buildMetaHeader(s) + '\n' + s.body
  const encoded = encodeURIComponent(body)
  const base = `${REGISTRY_NEW_FILE}?filename=${encodeURIComponent(filename)}`
  if (encoded.length < PREFILL_LIMIT) {
    return { url: `${base}&value=${encoded}`, prefilled: true }
  }
  return { url: base, prefilled: false }
}

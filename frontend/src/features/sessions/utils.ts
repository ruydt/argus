export function projectName(cwd: string): string {
  const segments = cwd.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? cwd
}

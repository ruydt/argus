import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ScriptBundle, ScriptPackage } from '@/types'

type BundleCardProps = {
  bundle: ScriptBundle
  packages: ScriptPackage[]
  onInstallBundle: (id: string) => void
  busy: boolean
}

export function BundleCard({ bundle, packages, onInstallBundle, busy }: BundleCardProps) {
  const members = packages.filter((p) => bundle.packages.includes(p.id))
  const installedCount = members.filter((p) => p.installed).length
  const allInstalled = members.length > 0 && installedCount === members.length
  const label = allInstalled
    ? 'Fully installed'
    : installedCount > 0
      ? `${installedCount}/${members.length} installed`
      : 'Available'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{bundle.title}</CardTitle>
          <Badge variant={allInstalled ? 'secondary' : 'outline'}>{label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{bundle.description}</p>
        <div className="flex flex-wrap gap-1">
          {members.map((p) => (
            <Badge key={p.id} variant="outline">
              {p.title}
            </Badge>
          ))}
        </div>
        <Button
          size="sm"
          disabled={busy || allInstalled}
          onClick={() => onInstallBundle(bundle.id)}
        >
          {allInstalled ? 'Installed' : 'Install bundle'}
        </Button>
      </CardContent>
    </Card>
  )
}

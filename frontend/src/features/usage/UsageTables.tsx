import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { UsageStats } from '@/types/usage'

type UsageTablesProps = {
  stats: UsageStats
}

export function UsageTables({ stats }: UsageTablesProps) {
  const modelsSorted = Object.entries(stats.models).sort((a, b) => b[1] - a[1])
  const keysSorted = Object.entries(stats.keys).sort((a, b) => b[1] - a[1])

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Model Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Requests</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelsSorted.map(([model, count]) => (
                <TableRow key={model}>
                  <TableCell className="font-medium text-[#ccc]">{model}</TableCell>
                  <TableCell className="text-right font-mono text-[#888]">
                    {count.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>API Key Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key ID</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keysSorted.map(([key, count]) => (
                <TableRow key={key}>
                  <TableCell className="font-mono text-[13px] text-[#ccc]">{key}</TableCell>
                  <TableCell className="text-right font-mono text-[#888]">
                    {count.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

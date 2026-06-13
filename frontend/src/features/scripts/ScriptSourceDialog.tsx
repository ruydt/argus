import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ScriptPackage } from '@/types'

type ScriptSourceDialogProps = {
  script: ScriptPackage
}

export function ScriptSourceDialog({ script }: ScriptSourceDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          View source
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl border border-white/15 bg-[#141414] shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{script.filename}</DialogTitle>
        </DialogHeader>
        <pre className="max-h-[70vh] overflow-auto rounded-md border border-white/10 bg-[#0a0a0a] p-4 text-xs leading-relaxed text-[#ccc]">
          {script.body}
        </pre>
      </DialogContent>
    </Dialog>
  )
}

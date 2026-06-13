import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
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
      <DialogContent className="max-w-2xl border border-white/15 bg-[#141414] shadow-2xl shadow-black/60">
        <DialogHeader>
          <DialogTitle className="font-mono">{script.filename}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] rounded-md border border-white/10 bg-[#0a0a0a]">
          <pre className="p-4 text-xs leading-relaxed text-[#ccc]">{script.body}</pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

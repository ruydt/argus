import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

type DashboardEmptyProps = {
  title: string
  description: string
}

export function DashboardEmpty({ title, description }: DashboardEmptyProps) {
  return (
    <Empty className="h-full border-0">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

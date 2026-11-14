import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronRight, Info, LockKeyhole, Pencil, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'

export function NavigationRow({
  title,
  description,
  href,
  icon: Icon = ChevronRight,
}: {
  title: string
  description: string
  href: string
  icon?: typeof Pencil
}) {
  return (
    <Item variant="card" render={<Link href={href} />}>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
    </Item>
  )
}

export function Notice({
  children,
  title,
  warning = false,
}: {
  children: ReactNode
  title?: string
  warning?: boolean
}) {
  const Icon = warning ? TriangleAlert : Info
  return (
    <Alert>
      <Icon aria-hidden="true" />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

export function Heading({ children, description }: { children: ReactNode; description?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-heading">{children}</h2>
      {description && <p className="text-body-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

export function LockedType() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 text-body-sm font-extrabold">
        <LockKeyhole aria-hidden="true" className="size-4" />
        Tablet · tablets
      </p>
      <p className="text-caption text-muted-foreground">
        Type and amount unit stay the same after a schedule or a dose has been added.
      </p>
    </div>
  )
}

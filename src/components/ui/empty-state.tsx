import type { ReactNode, Ref } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Says what's here, why, and what to do next. Geometry and rules live in DESIGN.md. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  titleAs: Title = 'h3',
  titleRef,
}: {
  icon: LucideIcon
  title: ReactNode
  body: ReactNode
  /** The full-width primary action, plus any quieter actions stacked below it. */
  action?: ReactNode
  titleAs?: 'h2' | 'h3'
  /** Makes the title focusable, for views that move focus to it. */
  titleRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <div
      data-slot="empty-state"
      className="flex flex-col items-center gap-5 pt-5 text-center [overflow-wrap:anywhere]"
    >
      <span className="flex size-22 items-center justify-center rounded-[1.625rem] bg-muted text-muted-foreground [&_svg]:size-9">
        <Icon aria-hidden="true" />
      </span>
      <div className="flex max-w-77.5 flex-col gap-2">
        <Title
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
          className="text-title font-extrabold text-balance outline-none"
        >
          {title}
        </Title>
        <p className="text-body-lg text-pretty text-muted-foreground">{body}</p>
      </div>
      {action && (
        <div data-slot="empty-state-action" className="flex w-full flex-col gap-2.5">
          {action}
        </div>
      )}
    </div>
  )
}

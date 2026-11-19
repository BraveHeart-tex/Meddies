import type { ReactNode } from 'react'

/** A Settings group heading: sentence case in muted bold small body text (380·A1). */
export function SettingsHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="px-1 text-body-sm leading-none font-bold text-muted-foreground">
      {children}
    </h2>
  )
}

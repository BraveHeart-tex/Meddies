import type { ReactNode } from 'react'

/**
 * A tab screen's 20px section column inside the AppShell: header, then sections. Today,
 * Medications and History share it, so the header stays put between tabs (#143).
 */
export function ScreenStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5">{children}</div>
}

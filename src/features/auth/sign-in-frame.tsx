import type { ReactNode } from 'react'

/** The access page's column and wordmark, shared with its route fallback (649·S1). */
export function SignInFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-5 px-5 pt-[calc(1.75rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <p className="text-display font-black tracking-tight">Meddies</p>
      {children}
    </main>
  )
}

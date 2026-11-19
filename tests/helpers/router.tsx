import type { ReactNode } from 'react'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import type { NextRouter } from 'next/router'

const router = { prefetch: async () => {} } as unknown as NextRouter

/**
 * Outside Next's bundler, next/link is the Pages version and ignores clicks without a router.
 * Wrap a component test's tree in this so `MedicationsLink` clicks change the view.
 */
export function WithRouter({ children }: { children: ReactNode }) {
  return <RouterContext.Provider value={router}>{children}</RouterContext.Provider>
}

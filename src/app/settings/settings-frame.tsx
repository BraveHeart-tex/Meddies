import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { AppHeader } from '@/components/layout/app-header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

/**
 * Settings without its account facts (649·G1), shared by the page and its route fallback so the
 * shell, headings and Time card cannot drift. `children` is the Account card's content.
 */
export function SettingsFrame({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <section className="space-y-5">
        <AppHeader title="Settings" align="center" />
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Account</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">{children}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Time</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-body-sm text-muted-foreground">
            Times are Istanbul time, 24-hour, wherever your device is.
          </CardContent>
        </Card>
      </section>
    </AppShell>
  )
}

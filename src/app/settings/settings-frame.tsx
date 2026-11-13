import { Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { AppHeader } from '@/components/layout/app-header'
import { SettingsGroup, SettingsRow } from './settings-list'

/**
 * Settings without its session facts, shared by the page and its route fallback so the shell,
 * headings and Time group cannot drift. `account` is the Account group's rows and `children` is
 * the sign-out area below the list.
 */
export function SettingsFrame({ account, children }: { account: ReactNode; children: ReactNode }) {
  return (
    // Named rather than read from the URL so the design lab frame (238·A5) selects it too.
    <AppShell current="/settings">
      <section className="space-y-5">
        <AppHeader title="Settings" />
        <SettingsGroup title="Account">{account}</SettingsGroup>
        <SettingsGroup title="Time" note="The same wherever your device is.">
          <SettingsRow icon={Clock} label="Times">
            Istanbul, 24-hour
          </SettingsRow>
        </SettingsGroup>
        <div className="space-y-1">{children}</div>
      </section>
    </AppShell>
  )
}

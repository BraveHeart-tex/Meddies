import { Hourglass, ShieldCheck, UserRound } from 'lucide-react'
import { AuthControl } from '@/features/auth/controls'
import { DeviceNotifications } from '@/features/device-registrations/device-notifications'
import { MedicationNamesSetting } from '@/features/medication-names/medication-names-setting'
import { QuietHoursSetting } from '@/features/quiet-hours/quiet-hours-setting'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { SettingsFrame } from './settings-frame'
import { SettingsRow } from './settings-list'

/**
 * Settings for a signed-in session: this device's notifications, the account's Quiet hours and
 * Medication names, the Account rows and sign-out inside the shared frame.
 * `expires` is the session's absolute end and `now` the server scheduling time it is shown from.
 */
export function SettingsScreen({ expires, now }: { expires: string; now: string }) {
  return (
    <SettingsFrame
      device={<DeviceNotifications />}
      quietHours={<QuietHoursSetting />}
      medicationNames={<MedicationNamesSetting />}
      account={
        <>
          <SettingsRow icon={UserRound} label="Google account">
            <span className="flex items-center gap-1 text-dose-taken-foreground [&>svg]:size-4">
              <ShieldCheck aria-hidden="true" />
              Approved
            </span>
          </SettingsRow>
          <SettingsRow icon={Hourglass} label="Session ends">
            <time dateTime={expires}>
              {formatShortDay(expires, now)} at {formatTime(expires)}
            </time>
          </SettingsRow>
        </>
      }
    >
      <AuthControl signedIn />
      <p className="text-caption text-muted-foreground">
        Signs out this browser only. Google and other devices stay signed in.
      </p>
    </SettingsFrame>
  )
}

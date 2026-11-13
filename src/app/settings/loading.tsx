import { Hourglass, UserRound } from 'lucide-react'
import { LoadingSection, Skeleton } from '@/components/ui/skeleton'
import { SettingsFrame } from './settings-frame'
import { SettingsRow } from './settings-list'

const line = 'h-[1lh] items-center'

function Bar({ width }: { width: string }) {
  return (
    <div className={`${line} flex`}>
      <Skeleton className={`h-3 rounded-md ${width}`} />
    </div>
  )
}

// The session is unknown here, so the account rows and sign-out stay placeholders: no line may
// claim that anyone is signed in. The Settings tab stays selected.
// Placeholder widths match the loaded text so rows wrap alike; the caption's container
// breakpoints follow where its text wraps, measured from 320px to 700px.
export default function Loading() {
  return (
    <SettingsFrame
      account={
        <>
          <SettingsRow icon={UserRound} label={<Bar width="w-29.5" />}>
            <Bar width="w-21.5" />
          </SettingsRow>
          <SettingsRow icon={Hourglass} label={<Bar width="w-25" />}>
            <Bar width="w-37.5" />
          </SettingsRow>
        </>
      }
    >
      <LoadingSection label="Opening Settings" className="space-y-1 @container">
        {/* The sign-out button and the 12px gap above its empty status line. */}
        <div className="pb-3">
          <Skeleton className="min-h-13 rounded-lg" />
        </div>
        <div className="text-caption">
          <div className={`${line} flex`}>
            <Skeleton className="h-2.5 w-full rounded-md" />
          </div>
          <div className={`${line} flex`}>
            <Skeleton className="h-2.5 w-full rounded-md" />
          </div>
          <div className={`${line} hidden @max-[23.75rem]:flex`}>
            <Skeleton className="h-2.5 w-3/4 rounded-md" />
          </div>
          <div className={`${line} hidden @max-[16rem]:flex`}>
            <Skeleton className="h-2.5 w-1/3 rounded-md" />
          </div>
        </div>
      </LoadingSection>
    </SettingsFrame>
  )
}

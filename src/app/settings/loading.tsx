import { LoadingSection, Skeleton } from '@/components/ui/skeleton'
import { SettingsFrame } from './settings-frame'

const line = 'h-[1lh] items-center'

// The session is unknown here, so the Account card's facts stay placeholders: no line may claim
// that anyone is signed in. The URL selects the header's Settings action and no bottom tab.
// Container breakpoints follow where the loaded text wraps, measured from 320px to 700px.
export default function Loading() {
  return (
    <SettingsFrame>
      <LoadingSection label="Opening Settings" className="space-y-4 @container">
        <div className="text-body-sm">
          <div className={`${line} flex`}>
            <Skeleton className="h-3 w-4/5 rounded-md" />
          </div>
          <div className={`${line} hidden @max-[19.25rem]:flex`}>
            <Skeleton className="h-3 w-1/3 rounded-md" />
          </div>
        </div>
        <div className={`${line} flex text-body-sm`}>
          <Skeleton className="h-3 w-3/5 rounded-md" />
        </div>
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

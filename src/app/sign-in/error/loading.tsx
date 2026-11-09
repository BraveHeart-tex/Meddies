import { LoadingSection, Skeleton } from '@/components/ui/skeleton'
import { SignInFrame } from '@/features/auth/sign-in-frame'

// The error is unknown until the page reads it, so only the logo and wordmark are real: nothing
// here may state what happened or offer an action. Outside the app, so there is no shell or
// navigation. The alert is sized for AccessDenied, the expected refusal for a one-account app;
// shorter failure messages settle a line or two higher. Breakpoints follow the measured text wrap.
export default function Loading() {
  return (
    <SignInFrame>
      <LoadingSection label="Opening sign-in" className="flex flex-col gap-5 @container">
        <div className="flex flex-col gap-1.5">
          <div className="flex h-[1lh] items-center text-display">
            <Skeleton className="h-6 w-2/3 rounded-lg" />
          </div>
          <div className="flex h-[1lh] items-center text-body-lg">
            <Skeleton className="h-3.5 w-1/2 rounded-md" />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {/* Lines of text, then the alert's padding, border and title gap. */}
          <Skeleton className="min-h-[calc(3lh+28px)] rounded-xl text-body-sm @max-[21.5rem]:min-h-[calc(5lh+28px)]" />
          <Skeleton className="min-h-13 rounded-lg" />
        </div>
      </LoadingSection>
    </SignInFrame>
  )
}

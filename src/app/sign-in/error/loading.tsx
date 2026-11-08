import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LoadingSection, Skeleton } from '@/components/ui/skeleton'
import { SignInFrame } from '@/features/auth/sign-in-frame'

// The error is unknown until the page reads it, so only the wordmark is real: nothing here may
// state what happened or offer an action. Outside the app, so there is no shell or navigation.
// The alert is sized for AccessDenied, the expected refusal for a one-account app; shorter
// failure messages settle a line or two higher. Breakpoints follow the measured text wrap.
export default function Loading() {
  return (
    <SignInFrame>
      <LoadingSection label="Opening sign-in" className="flex flex-col gap-5 @container">
        {/* Lines of text, then the alert's padding, border and title gap. */}
        <Skeleton className="min-h-[calc(3lh+28px)] rounded-xl text-body-sm @max-[21.5rem]:min-h-[calc(5lh+28px)]" />
        <Card>
          <CardHeader className="gap-3">
            <div className="flex h-[1lh] items-center text-heading">
              <Skeleton className="h-4.5 w-1/3 rounded-lg" />
            </div>
            <div className="flex h-[1lh] flex-col justify-around text-body-sm @max-[26.5rem]:h-[2lh]">
              <Skeleton className="h-3 w-full rounded-md" />
              <Skeleton className="hidden h-3 w-2/3 rounded-md @max-[26.5rem]:block" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="min-h-13 rounded-lg" />
          </CardContent>
        </Card>
      </LoadingSection>
    </SignInFrame>
  )
}

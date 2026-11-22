'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { MedicinePanel } from '@/features/medicines/medicine-panel'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { toast } from '@/components/ui/toast'
import { FixtureQuery } from '../fixture-query'
import { NOW, routine } from '../lab-fixtures'
import { correctionMedicine, type SharedState } from './type-correction-model'
import { Nav } from './type-correction-parts'
import { SimpleCorrection } from './type-correction-simple'

function SaveState({ state }: { state: SharedState }) {
  const [retried, setRetried] = useState(false)
  const pending = state === 'pending' || retried
  const messages: Partial<Record<SharedState, [string, string, string]>> = {
    unconfirmed: [
      'That might not have saved.',
      'Your details are still here. Check your connection and retry with the same details.',
      'Retry save',
    ],
    rejected: [
      'Your changes weren’t saved.',
      'Nothing changed. Your details are still here. Check the amounts before trying again.',
      'Try saving again',
    ],
    stale: [
      'This medication changed elsewhere.',
      'Your changes weren’t saved. Review the saved details and check every amount and your Stock count again.',
      'Review saved medication',
    ],
    offline: [
      'You’re offline.',
      'Keep Meddies open to retain these details. Reconnect to save. Nothing saves on its own.',
      'Connect to save',
    ],
  }
  const message = messages[state]
  return (
    <SimpleCorrection
      initialStep="save"
      lockReview={pending || state === 'unconfirmed' || state === 'stale'}
      saveActions={
        <div className="flex flex-col gap-3">
          {pending ? (
            <>
              <p role="status" className="text-body-sm">
                Saving your Type, amounts and Stock together.
              </p>
              <Button size="lg" disabled>
                Saving…
              </Button>
            </>
          ) : (
            message && (
              <>
                <Alert variant={state === 'offline' ? 'default' : 'destructive'}>
                  <TriangleAlert aria-hidden="true" />
                  <AlertTitle>{message[0]}</AlertTitle>
                  <AlertDescription>{message[1]}</AlertDescription>
                </Alert>
                {state === 'stale' ? (
                  <Nav href={`/medications?medicine=${correctionMedicine.id}&record=fix`} primary>
                    {message[2]}
                  </Nav>
                ) : (
                  <Button size="lg" disabled={state === 'offline'} onClick={() => setRetried(true)}>
                    {message[2]}
                  </Button>
                )}
                {state === 'unconfirmed' ? (
                  <Nav href="/lab/238-a3">Back to medication</Nav>
                ) : (
                  <Link href="/lab/440-s6" className={buttonVariants({ variant: 'ghost' })}>
                    Cancel change
                  </Link>
                )}
              </>
            )
          )}
        </div>
      }
    />
  )
}

/** Confirmation uses the production Medication detail and Toast, with corrected fixture data. */
function SavedMedication() {
  useEffect(() => {
    const receipt = toast.add({
      title: 'Details saved',
      description: 'Type, dose amounts and Stock saved together.',
      type: 'success',
      timeout: 0,
    })
    return () => {
      toast.close(receipt)
    }
  }, [])
  return (
    <FixtureQuery
      {...routine}
      medicines={routine.medicines.map((medicine) =>
        medicine.id === correctionMedicine.id
          ? {
              ...correctionMedicine,
              unit: 'capsule',
              strengthRevisions: correctionMedicine.strengthRevisions.map((period) => ({
                ...period,
                unit: 'capsule',
              })),
              stock: { tracked: true, count: 30 },
            }
          : medicine,
      )}
    >
      <AppShell current="/medications">
        <ScreenStack>
          <MedicinePanel
            scheduleMode="detail"
            detailMedicineId={correctionMedicine.id}
            initialNow={NOW}
            serverEntry
          />
        </ScreenStack>
      </AppShell>
    </FixtureQuery>
  )
}

export function CorrectionState({ state }: { state: SharedState }) {
  if (state === 'session')
    return (
      <AppShell showNavigation={false}>
        <ScreenStack>
          <h1 className="text-title">Your session ended</h1>
          <Alert>
            <AlertTitle>A save may still finish.</AlertTitle>
            <AlertDescription>
              Sign in again to check what was saved. Meddies can’t show its result until then.
            </AlertDescription>
          </Alert>
          <Link href="/" className={buttonVariants({ size: 'lg' })}>
            Sign in
          </Link>
        </ScreenStack>
      </AppShell>
    )
  if (state === 'cancel')
    return <SimpleCorrection initialStep="amount" initialIndex={1} initiallyDiscarding />
  if (state === 'saved') return <SavedMedication />
  return <SaveState state={state} />
}

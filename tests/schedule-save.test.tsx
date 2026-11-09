import type { ReactNode } from 'react'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { scheduleSetupKey } from '../src/features/schedules/schedule-setup-drafts'
import { useScheduleSave } from '../src/features/schedules/use-schedule-save'
import {
  scheduleKeys,
  scheduleSnapshotQuery,
  type ScheduleSnapshot,
} from '../src/features/schedules/queries'
import {
  createQueryClient,
  endSessionQueryClient,
  sessionQueryClient,
} from '../src/lib/session-query-client'
import { readSessionDraft, writeSessionDraft } from '../src/lib/session-drafts'
import { server } from './helpers/msw-server'

const medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Iron',
  strength: null,
  unit: 'tablet' as const,
}
const values = {
  startDate: '2035-06-15',
  weekdays: [5, 1],
  times: [
    { time: '20:00', quantity: 0.5 },
    { time: '08:00', quantity: 1 },
  ],
}
const confirmedAt = '2035-06-15T06:00:00.000Z'
const snapshot: ScheduleSnapshot = {
  schedules: [],
  records: [],
  now: confirmedAt,
  date: '2035-06-15',
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

test('normalized confirmation publishes and clears the draft before completion while refresh fails independently', async () => {
  const client = createQueryClient()
  const key = scheduleSetupKey(medicine.id)
  client.setQueryData(scheduleKeys.snapshot(), snapshot)
  writeSessionDraft(client, key, values)
  const refresh = deferred()
  let reads = 0
  server.use(
    http.post('/api/schedules', async ({ request }) => {
      const payload = (await request.json()) as object
      return HttpResponse.json({
        schedules: [
          {
            ...payload,
            weekdays: [1, 5],
            times: [...values.times].reverse(),
            endDate: null,
            confirmedAt,
          },
        ],
      })
    }),
    http.get('/api/schedules', async () => {
      reads++
      await refresh.promise
      return new HttpResponse(null, { status: 503 })
    }),
  )
  const onSaved = vi.fn()
  const hook = renderHook(
    () => {
      useQuery({ ...scheduleSnapshotQuery(), refetchOnMount: false })
      return useScheduleSave(medicine, onSaved)
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  )
  await act(async () => {
    await hook.result.current.submit(values)
  })
  expect(hook.result.current.pending).toBe(false)
  expect(hook.result.current.problem).toBeUndefined()
  expect(readSessionDraft(client, key)).toBeUndefined()
  expect(client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())?.schedules).toEqual([
    expect.objectContaining({
      medicineId: medicine.id,
      startDate: '2035-06-15',
      weekdays: [1, 5],
      times: [
        { time: '08:00', quantity: 1 },
        { time: '20:00', quantity: 0.5 },
      ],
      confirmedAt,
    }),
  ])
  expect(onSaved).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(reads).toBe(1))
  await act(async () => {
    refresh.release()
  })
  await waitFor(() => expect(client.getQueryState(scheduleKeys.snapshot())?.status).toBe('error'))
  expect(hook.result.current.problem).toBeUndefined()
  expect(client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())?.schedules).toHaveLength(1)
  hook.unmount()
  client.clear()
})

test('a schedule response after session end restores neither cache nor draft nor confirmation', async () => {
  const client = sessionQueryClient('schedule-save-end')
  client.setQueryData(scheduleKeys.snapshot(), snapshot)
  const held = deferred()
  const started = deferred()
  server.use(
    http.post('/api/schedules', async ({ request }) => {
      const payload = (await request.json()) as object
      started.release()
      await held.promise
      return HttpResponse.json({ schedules: [{ ...payload, confirmedAt }] })
    }),
  )
  const onSaved = vi.fn()
  const hook = renderHook(() => useScheduleSave(medicine, onSaved), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  let saving!: Promise<void>
  act(() => {
    saving = hook.result.current.submit(values)
  })
  await started.promise
  endSessionQueryClient()
  await act(async () => {
    held.release()
    await saving
  })
  expect(client.getQueryData(scheduleKeys.snapshot())).toBeUndefined()
  expect(readSessionDraft(client, scheduleSetupKey(medicine.id))).toBeUndefined()
  expect(onSaved).not.toHaveBeenCalled()
  hook.unmount()
})

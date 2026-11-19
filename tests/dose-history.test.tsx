import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { DoseHistory, DoseHistoryDose } from '../src/features/dose-history/contract'
import { doseTotals } from '../src/features/dose-history/contract'
import type { Medicine } from '../src/features/medicines/contract'
import { MedicinePanel } from '../src/features/medicines/medicine-panel'
import type { MedicationRecord } from '../src/features/medicines/routes'
import { doseSaveKey, doseSaves } from '../src/features/schedules/dose-saves'
import { createQueryClient } from '../src/lib/session-query-client'
import { server } from './helpers/msw-server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/medications',
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// 09:00 on Friday 15 June 2035 in Istanbul (UTC+3).
const initialNow = '2035-06-15T06:00:00.000Z'
const TODAY = '2035-06-15'
const ibuprofen: Medicine = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Ibuprofen',
  strength: '400 mg',
  unit: 'tablet',
  revision: 1,
  lastActionId: null,
  currentStrengthRevisionId: '00000000-0000-4000-8000-0000000000c1',
  strengthRevisions: [
    {
      id: '00000000-0000-4000-8000-0000000000c1',
      strength: '400 mg',
      effectiveAt: '2035-06-01T06:00:00.000Z',
      label: 'Ibuprofen',
      unit: 'tablet',
      previousValues: [],
    },
  ],
  everHadSchedule: true,
  everHadDose: true,
  latestTakenAt: null,
  archivedAt: null,
}
const scheduleId = '00000000-0000-4000-8000-0000000000a1'
const at = (date: string, time: string) => new Date(`${date}T${time}:00.000+03:00`).toISOString()

function scheduled(
  historyDate: string,
  due: string,
  taken: string,
  strength = '400 mg',
  takenDate = historyDate,
): DoseHistoryDose {
  return {
    kind: 'scheduled',
    scheduleId,
    dueAt: at(historyDate, due),
    historyDate,
    takenAt: at(takenDate, taken),
    quantity: 1,
    unit: 'tablet',
    strength,
    revision: 0,
  }
}
const day = (date: string, doses: DoseHistoryDose[]) => ({ date, doses, totals: doseTotals(doses) })

/**
 * Thu 14 Jun: 08:00, a ½-tablet Unscheduled dose at 14:10, 20:00. Wed 13 Jun: 08:00 at 400 mg and
 * Tuesday's 20:00 dose taken at 00:30 at 200 mg. Tue 12 Jun: 08:00 at 200 mg. Older days follow.
 */
const thursday = day('2035-06-14', [
  scheduled('2035-06-14', '20:00', '20:15'),
  {
    kind: 'unscheduled',
    id: '00000000-0000-4000-8000-0000000000d1',
    historyDate: '2035-06-14',
    takenAt: at('2035-06-14', '14:10'),
    quantity: 0.5,
    unit: 'tablet',
    strength: '400 mg',
    revision: 0,
  },
  scheduled('2035-06-14', '08:00', '08:05'),
])
const wednesday = day('2035-06-13', [
  scheduled('2035-06-13', '08:00', '08:05'),
  scheduled('2035-06-12', '20:00', '00:30', '200 mg', '2035-06-13'),
])
const tuesday = day('2035-06-12', [scheduled('2035-06-12', '08:00', '08:05', '200 mg')])
const monday = day('2035-06-11', [scheduled('2035-06-11', '08:00', '08:05', '200 mg')])

const firstPage: DoseHistory = {
  medicineId: ibuprofen.id,
  days: [thursday, wednesday, tuesday],
  before: '2035-06-12',
  summary: {
    lastDose: thursday.doses[0],
    today: [],
    last7Days: [
      { quantity: 3.5, unit: 'tablet', strength: '400 mg' },
      { quantity: 3, unit: 'tablet', strength: '200 mg' },
    ],
    last30Days: [
      { quantity: 3.5, unit: 'tablet', strength: '400 mg' },
      { quantity: 3, unit: 'tablet', strength: '200 mg' },
    ],
  },
}
// Repeats Tuesday, as a page read across a boundary might; it must not show twice.
const secondPage: DoseHistory = {
  medicineId: ibuprofen.id,
  days: [tuesday, monday],
  before: null,
  summary: null,
}
const empty: DoseHistory = {
  medicineId: ibuprofen.id,
  days: [],
  before: null,
  summary: { lastDose: null, today: [], last7Days: [], last30Days: [] },
}

type Reply = (before: string | null) => DoseHistory | Promise<DoseHistory | Response> | Response

function api({ medicines = [ibuprofen], reply }: { medicines?: Medicine[]; reply: Reply }) {
  const reads: (string | null)[] = []
  server.use(
    http.get('/api/medicines', () => HttpResponse.json({ medicines })),
    http.get('/api/schedules', () =>
      HttpResponse.json({
        schedules: [],
        records: [],
        today: { date: TODAY, now: initialNow, doses: [], upNext: null, next: null },
      }),
    ),
    http.get('/api/dose-history', async ({ request }) => {
      const params = new URL(request.url).searchParams
      expect(params.get('medicineId')).toBe(ibuprofen.id)
      const before = params.get('before')
      reads.push(before)
      const body = await reply(before)
      return body instanceof Response ? body : HttpResponse.json(body)
    }),
  )
  return reads
}

let client: QueryClient
beforeEach(() => {
  client = createQueryClient()
})
afterEach(() => {
  client.clear()
})

function renderPanel(record?: MedicationRecord) {
  window.history.replaceState(
    null,
    '',
    `/medications?medicine=${ibuprofen.id}${record ? `&record=${record}` : ''}`,
  )
  render(
    <QueryClientProvider client={client}>
      <MedicinePanel
        scheduleMode="detail"
        detailMedicineId={ibuprofen.id}
        initialNow={initialNow}
        record={record}
      />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const doseHistoryHref = `/medications?medicine=${ibuprofen.id}&record=doses`
const summary = () => screen.findByRole('region', { name: 'Summary' })
const windowTotal = (name: string) =>
  within(screen.getByRole('region', { name: 'Summary' }))
    .getByText(name, { selector: 'dt' })
    .parentElement!.querySelector('dd')!
const dayCard = (name: string) => screen.getByRole('region', { name })

describe('the Dose history row (387·S1)', () => {
  // Regression: the row missing, or opening another record view.
  test.each([
    { name: 'Medication detail', medicine: ibuprofen },
    {
      name: 'Archived medication detail',
      medicine: { ...ibuprofen, archivedAt: '2035-06-01T06:00:00.000Z' },
    },
  ])('$name opens Dose history from the row above Strength history', async ({ medicine }) => {
    api({ medicines: [medicine], reply: () => empty })
    renderPanel()
    const row = await screen.findByRole('link', { name: 'Dose history' })
    expect(row).toHaveAttribute('href', doseHistoryHref)
    const rows = within(row.closest('[data-slot="item-group"]')!).getAllByRole('link')
    expect(rows.map((link) => link.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining(['Dose history', 'Strength history']),
    )
    expect(rows.indexOf(row)).toBe(
      rows.findIndex((link) => link.getAttribute('aria-label') === 'Strength history') - 1,
    )
  })
})

describe('the Dose history screen', () => {
  // Regression: the summary or day cards lose a total, merge strengths or omit a dose's strength.
  test('shows the last dose, the window totals and one card per intake day from the read', async () => {
    api({ reply: () => firstPage })
    renderPanel('doses')
    await summary()
    expect(screen.getByRole('heading', { level: 1, name: 'Ibuprofen' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ibuprofen' })).toHaveAttribute(
      'href',
      `/medications?medicine=${ibuprofen.id}`,
    )
    expect(screen.getByRole('region', { name: 'Summary' })).toHaveTextContent(
      'Last doseThu 14 Jun · 20:151 tablet',
    )
    expect(windowTotal('Today')).toHaveTextContent('None taken')
    expect(windowTotal('Last 7 days')).toHaveTextContent('3½ tablets (400 mg) · 3 tablets (200 mg)')

    const days = within(screen.getByRole('region', { name: 'Doses by day' }))
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(days).toEqual(['Thursday, 14 June', 'Wednesday, 13 June', 'Tuesday, 12 June'])
    const thursdayCard = dayCard('Thursday, 14 June')
    expect(thursdayCard).toHaveTextContent('2½ tablets')
    expect(
      within(thursdayCard)
        .getAllByRole('link')
        .map((link) => link.textContent!.replace(/\s/g, ' ')),
    ).toEqual(['20:151 tablet', '14:10½ tablet', '08:051 tablet'])
    // Wednesday saved two strengths: its total splits, newest first, and each dose names its own.
    const wednesdayCard = dayCard('Wednesday, 13 June')
    expect(wednesdayCard).toHaveTextContent('1 tablet (400 mg) · 1 tablet (200 mg)')
    expect(within(wednesdayCard).getByRole('link', { name: /^08:05/ })).toHaveTextContent(
      '1 tablet · 400 mg',
    )
    expect(screen.queryByRole('status', { name: 'Loading dose history' })).not.toBeInTheDocument()
  })

  // Regression: a pending save missing from the screen, unmarked, or left out of the totals; or a
  // confirmed save that needs a reload.
  test('a Pending save for this medication shows marked as saving and counts in the totals', async () => {
    let confirmed = false
    const reads = api({
      reply: () =>
        confirmed
          ? {
              ...firstPage,
              days: [day(TODAY, [scheduled(TODAY, '08:00', '08:10')]), ...firstPage.days],
              summary: {
                ...firstPage.summary!,
                today: [{ quantity: 1, unit: 'tablet', strength: '400 mg' }],
              },
            }
          : firstPage,
    })
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.put('/api/schedules', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        await held
        confirmed = true
        return HttpResponse.json({ record: { ...body, revision: 0 } })
      }),
    )
    renderPanel('doses')
    await summary()
    const dueAt = at(TODAY, '08:00')
    const dose = {
      id: `${scheduleId}|${dueAt}`,
      scheduleId,
      medicineId: ibuprofen.id,
      dueAt,
      quantity: 1,
      status: 'Due now' as const,
    }
    act(() => {
      void doseSaves(client).submit(doseSaveKey(dose), {
        dose,
        command: { outcome: 'Taken', takenAt: at(TODAY, '08:10'), quantity: 1 },
        correction: null,
        medicine: { label: 'Ibuprofen', unit: 'tablet' },
        today: () => TODAY,
      })
    })

    const todayCard = await screen.findByRole('region', { name: 'Friday, 15 June' })
    expect(within(todayCard).getByRole('link')).toHaveTextContent('08:101 tablet')
    expect(within(todayCard).getByText('Saving · Taken')).toBeVisible()
    expect(within(await summary()).getAllByText('Saving · Taken')).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Summary' })).toHaveTextContent('Last dose08:10')
    expect(windowTotal('Today')).toHaveTextContent('1 tablet')
    expect(windowTotal('Last 7 days')).toHaveTextContent('4½ tablets (400 mg) · 3 tablets (200 mg)')
    expect(windowTotal('Last 30 days')).toHaveTextContent(
      '4½ tablets (400 mg) · 3 tablets (200 mg)',
    )

    // Confirmation rereads Dose history: the dose stays, unmarked, counted once.
    act(() => release())
    await waitFor(() => expect(screen.queryByText('Saving · Taken')).not.toBeInTheDocument())
    expect(reads).toEqual([null, null])
    expect(screen.getByRole('region', { name: 'Friday, 15 June' })).toHaveTextContent('1 tablet')
    expect(windowTotal('Today')).toHaveTextContent('1 tablet')
    expect(windowTotal('Last 7 days')).toHaveTextContent('3½ tablets (400 mg) · 3 tablets (200 mg)')
  })

  // Regression: Show earlier days repeating a day, or a late dose losing its History date.
  test('Show earlier days appends older days once, and a late dose names and links its History date', async () => {
    let failNext = true
    const reads = api({
      reply: (before) => {
        if (!before) return firstPage
        if (failNext) {
          failNext = false
          return HttpResponse.json({ error: 'unavailable' }, { status: 503 })
        }
        return secondPage
      },
    })
    const user = renderPanel('doses')
    await summary()
    const late = within(dayCard('Wednesday, 13 June')).getByRole('link', { name: /^00:30/ })
    expect(late).toHaveTextContent('00:301 tablet · 200 mg20:00 dose on Tue 12 Jun')
    expect(late).toHaveAttribute('href', '/history?date=2035-06-12')

    await user.click(screen.getByRole('button', { name: 'Show earlier days' }))
    // A failure keeps the loaded days and offers Try again below them.
    expect(await screen.findByText('Couldn’t load earlier days.')).toBeVisible()
    expect(dayCard('Tuesday, 12 June')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('region', { name: 'Monday, 11 June' })).toBeVisible()
    expect(reads).toEqual([null, '2035-06-12', '2035-06-12'])
    expect(screen.getAllByRole('region', { name: 'Tuesday, 12 June' })).toHaveLength(1)
    expect(within(dayCard('Tuesday, 12 June')).getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Show earlier days' })).not.toBeInTheDocument()
    expect(screen.queryByText('Couldn’t load earlier days.')).not.toBeInTheDocument()
  })

  // Regression: the empty state losing Log a dose, or offering it on an Archived medication.
  test.each([
    { name: 'a medication', medicine: ibuprofen, logs: true },
    {
      name: 'an Archived medication',
      medicine: { ...ibuprofen, archivedAt: '2035-06-01T06:00:00.000Z' },
      logs: false,
    },
  ])('$name with no Taken doses shows the empty message', async ({ medicine, logs }) => {
    api({ medicines: [medicine], reply: () => empty })
    renderPanel('doses')
    expect(await screen.findByRole('heading', { name: 'No doses taken yet' })).toBeVisible()
    expect(
      screen.getByText('Doses you log as taken show here, with how much you took.'),
    ).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Summary' })).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'Doses taken, by the day you took them. Open one to change it in History.',
      ),
    ).not.toBeInTheDocument()
    expect(Boolean(screen.queryByRole('button', { name: 'Log a dose' }))).toBe(logs)
  })

  // Regression: a failed first read with no way to retry.
  test('a failed read offers Try again', async () => {
    let fail = true
    api({
      reply: () =>
        fail ? HttpResponse.json({ error: 'unavailable' }, { status: 503 }) : firstPage,
    })
    const user = renderPanel('doses')
    expect(await screen.findByText('Couldn’t load dose history.')).toBeVisible()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await summary()
  })
})

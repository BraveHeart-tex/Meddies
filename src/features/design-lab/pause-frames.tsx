import type { ReactNode } from 'react'
import type { DesignFrame } from './frames'
import {
  clockPaused,
  clockPausedLastDay,
  clockRunning,
  intervalPaused,
  intervalRunning,
  RESUME_AT_TWO,
  RESUME_BLANK,
  RESUME_TUESDAY,
  RESUME_YESTERDAY,
  resumed,
  type PausableSchedule,
} from './pause-model'
import type { ResumeValues } from '@/features/schedules/resume'
import { PausedListFrame } from './pause-list'
import { PausedAlert, ResumedAlert } from './pause-parts'
import { PauseDetail, ResumeScreen, type Links } from './pause-screens'

const links = (schedule: PausableSchedule): Links => ({
  change: schedule.intervalHours != null ? '/lab/227-a10' : '/lab/227-a7',
  pause: '/lab/233-a3',
  stop: '/lab/227-a15',
  resume: '/lab/233-a9',
})

const detail = (
  schedule: PausableSchedule,
  extra: Omit<Parameters<typeof PauseDetail>[0], 'schedule' | 'links'> = {},
) => <PauseDetail schedule={schedule} links={links(schedule)} {...extra} />

const resumedDetail = (schedule: PausableSchedule) =>
  detail(schedule, { alert: <ResumedAlert schedule={schedule} /> })

const resumeScreen = (initial: ResumeValues, validated?: boolean, saving?: boolean) => (
  <ResumeScreen
    initial={initial}
    schedule={intervalPaused}
    validated={validated}
    saving={saving}
    back="/lab/233-a5"
  />
)

const frame = (id: string, title: string, render: () => ReactNode): DesignFrame => ({
  slug: `233-${id.toLowerCase()}` as DesignFrame['slug'],
  title,
  citation: `233·${id}` as DesignFrame['citation'],
  render,
})

/**
 * #233, Direction A approved: Pause beside Stop schedule under Change schedule, a paused card with
 * Resume and Stop schedule, paused rows kept in On a schedule, one-tap Clock resume, and Interval
 * resume on a full screen with the Starts row (A); then the save states (S).
 */
export const pauseFrames: readonly DesignFrame[] = [
  frame('A1', 'Detail, set times, Pause beside the others', () => detail(clockRunning)),
  frame('A2', 'Detail, every few hours', () => detail(intervalRunning)),
  frame('A3', 'Pause, confirm step', () => detail(clockRunning, { pause: 'idle' })),
  frame('A4', 'Paused, set times, just saved', () =>
    detail(clockPaused, { alert: <PausedAlert /> }),
  ),
  frame('A5', 'Paused, every few hours', () => detail(intervalPaused)),
  frame('A6', 'Medications, paused row', () => <PausedListFrame />),
  frame('A7', 'Resumed, set times, next dose named', () => resumedDetail(resumed(clockPaused))),
  frame('A8', 'Resumed on the Last day, no more doses', () =>
    resumedDetail(resumed(clockPausedLastDay)),
  ),
  frame('A9', 'Resume every few hours, empty', () => resumeScreen(RESUME_BLANK)),
  frame('A10', 'Resume, filled with the preview', () => resumeScreen(RESUME_AT_TWO)),
  frame('A11', 'Resume, Anchor before today', () => resumeScreen(RESUME_YESTERDAY, true)),
  frame('A12', 'Resume, Last day cuts the preview', () => resumeScreen(RESUME_TUESDAY)),
  frame('A13', 'Resumed, every few hours, next dose named', () =>
    resumedDetail(resumed(intervalPaused, RESUME_AT_TWO)),
  ),
  frame('S1', 'Pausing', () => detail(clockRunning, { pause: 'saving' })),
  frame('S2', 'Pause might not have saved', () => detail(clockRunning, { pause: 'unknown' })),
  frame('S3', 'Resuming, set times', () => detail(clockPaused, { resume: 'saving' })),
  frame('S4', 'Resume might not have saved', () => detail(clockPaused, { resume: 'unknown' })),
  frame('S5', 'Resuming, every few hours', () => resumeScreen(RESUME_AT_TWO, undefined, true)),
]

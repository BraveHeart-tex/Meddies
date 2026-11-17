/**
 * #371 floating Toasts for save confirmations: the nine confirmations and the approved direction's
 * behavior notes (371·A1-A11). Copy is the inline Alert text each confirmation replaces (docs/copy.md).
 */

/** `check` follows the dose status grammar: a save or Taken. A stop or deletion shows no glyph. */
export type LabToast = { title: string; detail?: string; glyph: 'check' | 'none' }

export const LONG_LABEL = 'Amoxicillin with clavulanic acid oral suspension'

export const confirmations = {
  scheduleSaved: {
    title: 'Schedule saved for Amoxicillin.',
    detail: 'Next dose: today at 20:00.',
    glyph: 'check',
  },
  medicationSaved: {
    title: 'Amoxicillin saved.',
    detail: 'First dose: today at 20:00.',
    glyph: 'check',
  },
  paused: {
    title: 'Schedule paused for Amoxicillin.',
    detail: 'No doses expected until you resume.',
    glyph: 'none',
  },
  resumed: {
    title: 'Schedule resumed for Amoxicillin.',
    detail: 'Next dose: today at 20:00.',
    glyph: 'check',
  },
  stopped: {
    title: 'Schedule stopped for Amoxicillin.',
    detail: 'No more doses after 10:00 today.',
    glyph: 'none',
  },
  restored: {
    title: 'Amoxicillin restored',
    detail: 'No schedule has restarted. Set one when you’re ready.',
    glyph: 'check',
  },
  deleted: {
    title: 'Ibuprofen deleted',
    detail: 'This medication had no schedule or doses.',
    glyph: 'none',
  },
  fixedDetails: { title: 'Fixed details saved', glyph: 'check' },
  strengthChange: { title: 'Strength change saved', glyph: 'check' },
  alreadyTaken: {
    title: 'Magnesium scheduled for 08:00 was already recorded as taken.',
    glyph: 'check',
  },
  longName: {
    title: `Schedule saved for ${LONG_LABEL}.`,
    detail: 'Next dose: today at 20:00.',
    glyph: 'check',
  },
} satisfies Record<string, LabToast>

/** Confirmations 1-8 in the ticket's order, for the catalog frame 371·A4. */
export const catalog: readonly LabToast[] = [
  confirmations.scheduleSaved,
  confirmations.medicationSaved,
  confirmations.paused,
  confirmations.resumed,
  confirmations.stopped,
  confirmations.restored,
  confirmations.deleted,
  confirmations.fixedDetails,
]

/** Receipt row: behavior the frames' notes state. */
export const receiptRow = {
  name: 'Receipt row',
  swipe: 'Swipe left, right or down',
  timing: '4 s, 6 s with a detail line · touch or focus pauses',
  stack: 'Older Toast peeks behind, scaled',
}

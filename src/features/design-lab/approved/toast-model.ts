/**
 * #371 floating Toasts for save confirmations: the confirmations the remaining frames show and
 * the approved direction's behavior notes. Copy is the inline Alert text each confirmation
 * replaces (docs/copy.md).
 */

/** `check` follows the dose status grammar: a save or Taken. A stop or deletion shows no glyph. */
export type LabToast = { title: string; detail?: string; glyph: 'check' | 'none' }

export const confirmations = {
  scheduleSaved: {
    title: 'Schedule saved for Amoxicillin.',
    detail: 'Next dose: today at 20:00.',
    glyph: 'check',
  },
  fixedDetails: { title: 'Fixed details saved', glyph: 'check' },
  alreadyTaken: {
    title: 'Magnesium scheduled for 08:00 was already recorded as taken.',
    glyph: 'check',
  },
} satisfies Record<string, LabToast>

/** Receipt row: behavior the frames' notes state. */
export const receiptRow = {
  name: 'Receipt row',
  stack: 'Older Toast peeks behind, scaled',
}

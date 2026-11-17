import { screen } from '@testing-library/react'
import { expect } from 'vitest'

/**
 * Finds a save confirmation Toast by its title and checks its glyph (DESIGN.md: the check for a
 * save, resume or restore; none for a pause, stop or deletion) and that no inline status repeats
 * it in the page flow (#377). Catches a confirmation rendered inline again or a wrong glyph.
 */
export async function findConfirmation(title: string, glyph: 'check' | 'none', detail?: string) {
  const toast = await screen.findByRole('dialog', { name: title })
  if (detail) expect(toast).toHaveTextContent(detail)
  expect(toast.querySelector('[data-slot="toast-icon"]') !== null).toBe(glyph === 'check')
  const inline = screen.queryAllByRole('status').filter((el) => el.textContent?.includes(title))
  expect(inline).toEqual([])
  return toast
}

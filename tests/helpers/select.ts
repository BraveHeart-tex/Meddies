import { screen, within } from '@testing-library/react'

/**
 * The open select's option showing exactly `text`, once its popup is positioned and visible.
 * A role-and-name query computes every option's accessible name, slow for the 60 minutes
 * under jsdom; matching the option text skips that.
 */
export const listedOption = async (text: string) =>
  within(await screen.findByRole('listbox')).getByText(text, { selector: '[role="option"] > *' })

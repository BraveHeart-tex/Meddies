import * as React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { TimePicker } from '@/components/ui/time-picker'
import type { PickerHandle } from '@/components/ui/date-picker'

// Regression: the option elements are shared across renders and pickers, so a selection or
// highlight could leak between pickers or stop updating after a controlled reset.
test('shared options keep independent selection, partial values, reset, focus and blur', async () => {
  const user = userEvent.setup()
  const blur = vi.fn()
  const handle = React.createRef<PickerHandle>()
  function Harness() {
    const [first, setFirst] = React.useState('')
    const [second, setSecond] = React.useState('09:30')
    return (
      <>
        <p id="error">Choose a time.</p>
        <TimePicker
          ref={handle}
          id="first"
          label="First"
          value={first}
          onValueChange={setFirst}
          onBlur={blur}
          required
          aria-invalid
          aria-describedby="error"
        />
        <TimePicker id="second" label="Second" value={second} onValueChange={setSecond} />
        <TimePicker
          id="disabled"
          label="Disabled"
          value="10:45"
          onValueChange={() => {}}
          disabled
        />
        <output aria-label="First value">{first}</output>
        <button onClick={() => setFirst('')}>Clear</button>
      </>
    )
  }
  render(<Harness />)
  const first = (part: string) => screen.getByRole('combobox', { name: `First ${part}` })
  const second = (part: string) => screen.getByRole('combobox', { name: `Second ${part}` })
  const pick = async (trigger: HTMLElement, value: string) => {
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: value }))
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  }
  expect(first('hour')).toHaveAccessibleDescription('Choose a time.')
  expect(first('minute')).toHaveAttribute('aria-invalid', 'true')
  expect(first('hour')).toHaveAttribute('aria-required', 'true')
  expect(screen.getByRole('combobox', { name: 'Disabled hour' })).toBeDisabled()
  expect(screen.getByRole('combobox', { name: 'Disabled minute' })).toBeDisabled()
  await pick(first('hour'), '08')
  expect(screen.getByLabelText('First value')).toHaveTextContent('08:')
  expect(first('hour')).toHaveFocus()
  act(() => handle.current?.focus())
  expect(first('minute')).toHaveFocus()
  expect(blur).not.toHaveBeenCalled()
  await pick(first('minute'), '15')
  expect(screen.getByLabelText('First value')).toHaveTextContent('08:15')
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('option', { name: '15' })).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{ArrowDown}{Enter}')
  await waitFor(() => expect(first('minute')).toHaveTextContent('16'))
  expect(first('minute')).toHaveFocus()
  expect(blur).not.toHaveBeenCalled()
  await pick(second('minute'), '45')
  expect(second('hour')).toHaveTextContent('09')
  expect(first('minute')).toHaveTextContent('16')
  await user.click(first('minute'))
  expect(await screen.findByRole('option', { name: '16' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('option', { name: '45' })).toHaveAttribute('aria-selected', 'false')
  await user.keyboard('{Escape}')
  await waitFor(() => expect(first('minute')).toHaveFocus())
  await user.click(screen.getByRole('button', { name: 'Clear' }))
  await waitFor(() => expect(blur).toHaveBeenCalled())
  expect(first('hour')).toHaveTextContent('HH')
  expect(first('minute')).toHaveTextContent('MM')
  expect(second('minute')).toHaveTextContent('45')
  await pick(first('minute'), '05')
  expect(screen.getByLabelText('First value')).toHaveTextContent(':05')
  act(() => handle.current?.focus())
  expect(first('hour')).toHaveFocus()
})

'use client'

import { useState } from 'react'
import { DatePicker } from '@/components/ui/date-picker'

// History's GET date filter. The picked date submits as `date` with the surrounding form.
export function HistoryDateField({ defaultValue, today }: { defaultValue: string; today: string }) {
  const [value, setValue] = useState(defaultValue)
  return (
    <DatePicker
      id="history-date"
      name="date"
      label="Choose a date"
      today={today}
      max={today}
      value={value}
      onValueChange={setValue}
    />
  )
}

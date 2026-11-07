import type { Ref } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Medicine } from '@/features/medicines/contract'

export function ScheduleMedicineSelect({
  medicines,
  value,
  onValueChange,
  disabled,
  missing,
  triggerRef,
}: {
  medicines: Medicine[]
  value: string
  onValueChange: (value: string | null) => void
  disabled: boolean
  missing: boolean
  triggerRef: Ref<HTMLButtonElement>
}) {
  const medicineItems = medicines.map((medicine) => ({
    value: medicine.id,
    label: `${medicine.label} (${medicine.unit})`,
  }))
  return (
    <div className="space-y-2">
      <label htmlFor="schedule-medicine" className="block font-medium">
        Medicine
      </label>
      <Select
        id="schedule-medicine"
        items={medicineItems}
        value={value || null}
        onValueChange={(next) => onValueChange(next)}
        disabled={disabled}
      >
        <SelectTrigger
          ref={triggerRef}
          aria-required
          aria-invalid={missing}
          aria-describedby={missing ? 'schedule-medicine-error' : undefined}
        >
          <SelectValue placeholder="Choose a medicine" />
        </SelectTrigger>
        <SelectContent>
          {medicineItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {missing && (
        <p id="schedule-medicine-error" role="alert">
          Choose a medicine.
        </p>
      )}
    </div>
  )
}

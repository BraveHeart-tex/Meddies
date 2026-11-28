import { parseMedicineResponse, type Medicine, type MedicineInput } from './contract'

function matchingMedicine(value: unknown, attempted: MedicineInput): Medicine {
  const saved = parseMedicineResponse(value)
  if (
    saved.id !== attempted.id ||
    saved.label !== attempted.label ||
    saved.strength !== attempted.strength ||
    saved.unit !== attempted.unit ||
    // A count in Add turns stock on at that count (#46); only a full record carries stock.
    (attempted.startingCount !== undefined &&
      saved.stock !== undefined &&
      (!saved.stock.tracked || saved.stock.count !== attempted.startingCount))
  )
    throw new Error('Medicine confirmation does not match attempt')
  return saved
}

export function confirmMedicineResponse(data: unknown, attempted: MedicineInput): Medicine {
  const envelope = data as { medicines?: unknown[] } | null
  return matchingMedicine(envelope?.medicines?.[0], attempted)
}

export function reconcileMedicineSave(list: Medicine[], attempted: MedicineInput): Medicine {
  return matchingMedicine(
    list.find((item) => item.id === attempted.id),
    attempted,
  )
}

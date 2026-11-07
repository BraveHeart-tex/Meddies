// Dose quantities: how many tablets or capsules one dose takes, never product strength. Editing
// text may be blank, a decimal ('1.5', '1,5') or a half glyph ('1½'); the server stores numbers.

export type DoseUnit = 'tablet' | 'capsule'

/** Step, minimum and new-row text per unit: tablets in halves, capsules whole (FE-647 D3). */
export function quantityRule(unit: DoseUnit) {
  return unit === 'capsule'
    ? { step: 1, min: 1, initial: '1' }
    : { step: 0.5, min: 0.5, initial: '1' }
}

/** The number in quantity text: null when blank, NaN when not a non-negative number. */
export function parseQuantity(text: string): number | null {
  const value = text.trim()
  if (!value) return null
  const normalized = value.replace('½', '.5').replace(',', '.')
  if (!/^\d*\.?\d+$/.test(normalized)) return Number.NaN
  return Number(normalized)
}

/** '½', '1', '1½': whole part plus a half glyph. Other fractions keep their decimals. */
export function formatQuantity(value: number): string {
  const whole = Math.floor(value)
  const rest = value - whole
  if (rest === 0) return String(whole)
  if (rest === 0.5) return `${whole || ''}½`
  return String(value)
}

/** 'tablet' up to one, 'tablets' above one; plural while the quantity is unknown. */
export function unitName(value: number | null, unit: DoseUnit): string {
  return value !== null && value <= 1 ? unit : `${unit}s`
}

/** '½ tablet', '1½ tablets', '2 capsules'. */
export function quantityLabel(value: number, unit: DoseUnit): string {
  return `${formatQuantity(value)} ${unitName(value, unit)}`
}

/** The text after one stepper press: snaps to the unit's grid, never below its minimum. */
export function stepQuantity(text: string, unit: DoseUnit, direction: 1 | -1): string {
  const { step, min } = quantityRule(unit)
  const value = parseQuantity(text)
  if (value === null || Number.isNaN(value)) return formatQuantity(min)
  const units = value / step
  const onGrid = Number.isInteger(units)
  const next =
    direction === 1
      ? (onGrid ? units + 1 : Math.ceil(units)) * step
      : (onGrid ? units - 1 : Math.floor(units)) * step
  return formatQuantity(Math.max(min, next))
}

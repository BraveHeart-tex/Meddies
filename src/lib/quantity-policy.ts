// Quantity policy: the one place that knows each Medicine type's Quantity unit and dose amount
// rules (docs/product/medication-domain.md#medicine-types-and-quantity-units). UI forms,
// contracts and the Worker read Types, menu order, steps, minimums, safe bounds, new dose amounts,
// parsing, stepping, wording, Strength help and amount errors from here; none of them branch on a Type.
//
// Each entry stores amounts on a grid of `1 / scale` (halves for tablets, tenths for ml, wholes
// for counted units) and checks them by rounding to whole grid steps, so decimals like 0.3 stay
// exact. `max` keeps grid arithmetic inside safe integers; there is no medical maximum.
// Amount labels join number and unit with a no-break space so they never wrap apart.
//
// Access: every entry is readable, so read contracts accept stored amounts for it; only
// `writable` entries reach the Type menu, write contracts and Worker validation.
//
// Adding a Type: add one entry below, in menu order, with its own unit words, grid, minimum,
// new dose amount, Strength help and errors (counted units use `countedEntry`). Never reuse another Type's
// rules. Leave it unwritable until its persistence ships, then flip `writable`.

/** A Quantity unit's rules; production entries live in `medicineTypes`, tests may build more. */
export type QuantityEntry = {
  /** Type menu label. */
  label: string
  /** Quantity unit up to one, and above one or while the amount is unknown. */
  unit: string
  plural: string
  /** Grid steps per whole unit: the step and minimum are `1 / scale`. */
  scale: number
  /** The largest amount whose grid arithmetic stays exact. */
  max: number
  /** A new dose's amount. */
  initial: number
  /** Number text for an amount, as forms and labels show it. */
  format: (value: number) => string
  /** Errors for amounts below the minimum and off the grid. */
  tooSmall: string
  offGrid: string
}

/** Tablet and Capsule amounts stay exact as integer counts of halves. */
const HALF_SAFE = Number.MAX_SAFE_INTEGER / 2

/** Whole-number units such as capsules, puffs and drops: step, minimum and new amount 1. */
export function countedEntry(label: string, unit: string, plural: string): QuantityEntry {
  return {
    label,
    unit,
    plural,
    scale: 1,
    max: HALF_SAFE,
    initial: 1,
    format: String,
    tooSmall: `Use 1 ${unit} or more.`,
    offGrid: `Use whole ${plural}.`,
  }
}

/** Strength help while the Type is unset, and for Types sold in packs. */
const packHelp = 'On the pack, e.g. 200 mg. Not your dose amount.'

const medicineTypes = {
  tablet: {
    label: 'Tablet',
    unit: 'tablet',
    plural: 'tablets',
    scale: 2,
    max: HALF_SAFE,
    initial: 1,
    // '½', '1', '1½': whole part plus a half glyph.
    format: (value) => {
      const whole = Math.floor(value)
      const rest = value - whole
      if (rest === 0) return String(whole)
      if (rest === 0.5) return `${whole || ''}½`
      return String(value)
    },
    tooSmall: 'Use ½ tablet or more.',
    offGrid: 'Use whole or half tablets.',
    strengthHelp: packHelp,
    writable: true,
  },
  capsule: {
    ...countedEntry('Capsule', 'capsule', 'capsules'),
    strengthHelp: packHelp,
    writable: true,
  },
  liquid: {
    label: 'Liquid',
    unit: 'ml',
    plural: 'ml',
    scale: 10,
    max: Math.floor(Number.MAX_SAFE_INTEGER / 10),
    initial: 1,
    format: (value) => String(Math.round(value * 10) / 10),
    tooSmall: 'Use 0.1 ml or more.',
    offGrid: 'Use steps of 0.1 ml, like 1.2 ml.',
    strengthHelp: 'On the bottle, e.g. 250 mg/5 ml. Not your dose amount.',
    writable: true,
  },
  inhaler: {
    ...countedEntry('Inhaler', 'puff', 'puffs'),
    strengthHelp: 'On the inhaler, e.g. 100 mcg per puff. Not your dose amount.',
    writable: true,
  },
  drops: {
    ...countedEntry('Drops', 'drop', 'drops'),
    strengthHelp: 'On the bottle, e.g. 0.5%. Not your dose amount.',
    writable: true,
  },
} as const satisfies Record<string, QuantityEntry & { strengthHelp: string; writable: boolean }>

type Entries = typeof medicineTypes
/** A Medicine type a read may show. */
export type MedicineType = keyof Entries
/** A Medicine type writes accept. */
export type WritableMedicineType = {
  [K in MedicineType]: Entries[K]['writable'] extends true ? K : never
}[MedicineType]
export type Access = 'read' | 'write'
/** A production Medicine type, or an entry built by tests. */
export type Quantity = MedicineType | QuantityEntry

const typeKeys = Object.keys(medicineTypes) as MedicineType[]
const writableKeys = typeKeys.filter((type) => medicineTypes[type].writable) as [
  WritableMedicineType,
  ...WritableMedicineType[],
]

/** Writable Types in menu order, as stored values; the Worker schema reads this. */
export const writableMedicineTypes: readonly [WritableMedicineType, ...WritableMedicineType[]] =
  writableKeys

/** The Type menu: writable Types in menu order. */
export const medicineTypeOptions = writableKeys.map((value) => ({
  value,
  label: medicineTypes[value].label,
}))

export function isMedicineType(value: unknown): value is MedicineType {
  return typeKeys.includes(value as MedicineType)
}

export function isWritableMedicineType(value: unknown): value is WritableMedicineType {
  return writableKeys.includes(value as WritableMedicineType)
}

export function medicineTypeLabel(type: MedicineType): string {
  return medicineTypes[type].label
}

/** Strength help for the chosen Type, or the pack help while none is chosen. */
export function strengthHelp(type: MedicineType | null): string {
  return type ? medicineTypes[type].strengthHelp : packHelp
}

function entry(quantity: Quantity): QuantityEntry {
  return typeof quantity === 'string' ? medicineTypes[quantity] : quantity
}

/** Parameters for checking the same amount grid inside a database write. */
export function quantityBounds(type: MedicineType) {
  const { scale, max } = entry(type)
  return { scale, max }
}

/** Whether a stored amount is positive, within the safe bound and on the unit's grid. */
export function isQuantityFor(value: unknown, quantity: Quantity): value is number {
  const { scale, max } = entry(quantity)
  return (
    typeof value === 'number' &&
    value > 0 &&
    value <= max &&
    Math.round(value * scale) / scale === value
  )
}

/** Stock shares the quantity grid and safe bound, with zero allowed. */
export function isStockCount(value: unknown, quantity: Quantity): value is number {
  return value === 0 || isQuantityFor(value, quantity)
}

/** The Worker's check once it has looked up the owned Medicine's Type. */
export function isWritableQuantity(value: unknown, type: unknown): value is number {
  return isWritableMedicineType(type) && isQuantityFor(value, type)
}

/** A contract's check before the Type is known: some Type with that access accepts it. */
export function isDoseQuantity(value: unknown, access: Access = 'write'): value is number {
  return (access === 'write' ? writableKeys : typeKeys).some((type) => isQuantityFor(value, type))
}

/** Step, minimum and new-row text for a Quantity unit. */
export function quantityRule(quantity: Quantity) {
  const rule = entry(quantity)
  return { step: 1 / rule.scale, min: 1 / rule.scale, initial: rule.format(rule.initial) }
}

/**
 * The number in quantity text: null when blank, NaN when not a non-negative number. Accepts a
 * decimal comma ('1,5') and a half glyph ('1½').
 */
export function parseQuantity(text: string): number | null {
  const value = text.trim()
  if (!value) return null
  const normalized = value.replace('½', '.5').replace(',', '.')
  if (!/^\d*\.?\d+$/.test(normalized)) return Number.NaN
  return Number(normalized)
}

/** '1½' for tablets, '1.5' for ml, '2' for counted units such as capsules, puffs and drops. */
export function formatQuantity(value: number, quantity: Quantity): string {
  return entry(quantity).format(value)
}

/** Singular above zero up to one; plural for zero, above one and while the amount is unknown;
 * 'ml' never changes. */
export function unitName(value: number | null, quantity: Quantity): string {
  const { unit, plural } = entry(quantity)
  return value !== null && value > 0 && value <= 1 ? unit : plural
}

/** '½ tablet', '2 capsules', '1.5 ml', joined by a no-break space. */
export function quantityLabel(value: number, quantity: Quantity): string {
  return `${formatQuantity(value, quantity)}\u00a0${unitName(value, quantity)}`
}

/** The text after one stepper press: snaps to the unit's grid, never below its minimum, or below
 * zero with `zero` (a stock count). */
export function stepQuantity(
  text: string,
  quantity: Quantity,
  direction: 1 | -1,
  zero = false,
): string {
  const { scale } = entry(quantity)
  const value = parseQuantity(text)
  if (value === null || Number.isNaN(value)) return formatQuantity(1 / scale, quantity)
  const units = value * scale
  const nearest = Math.round(units)
  const onGrid = nearest / scale === value
  const next =
    direction === 1
      ? onGrid
        ? nearest + 1
        : Math.ceil(units)
      : onGrid
        ? nearest - 1
        : Math.floor(units)
  return formatQuantity(Math.max(zero ? 0 : 1, next) / scale, quantity)
}

/** The inline error for quantity text, or null when it is a valid dose for the unit. */
export function quantityProblem(text: string, quantity: Quantity): string | null {
  const rule = entry(quantity)
  const value = parseQuantity(text)
  if (value === null) return 'Enter a quantity.'
  if (Number.isNaN(value) || value === 0) return rule.tooSmall
  if (value > rule.max) return 'Enter a smaller quantity.'
  if (!isQuantityFor(value, rule)) return rule.offGrid
  return null
}

/**
 * A Stock count in words: "24 tablets left", "12½ tablets left", "150 ml left". Zero and
 * counts above one take the plural; ml never changes. Shared by the Medications list and the
 * Medication detail Stock row.
 */
export function stockLeft(count: number, quantity: Quantity): string {
  return `${formatQuantity(count, quantity)} ${unitName(count, quantity)} left`
}

/**
 * The inline error for optional starting-count text, or null when it is empty or a valid count.
 * Zero is allowed; the grid and safe bound follow the unit.
 */
export function stockCountProblem(text: string, quantity: Quantity): string | null {
  const rule = entry(quantity)
  const value = parseQuantity(text)
  if (value === null || value === 0) return null
  if (Number.isNaN(value)) return 'Enter a number, like 30.'
  if (value > rule.max) return 'Enter a smaller quantity.'
  if (!isQuantityFor(value, rule)) return rule.offGrid
  return null
}

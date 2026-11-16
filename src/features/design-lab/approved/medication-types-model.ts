// #265 lab-only values: the Medicine type and Quantity unit rules from
// docs/product/medication-domain.md#medicine-types-and-quantity-units, shaped for frames only.
// #266 owns the production policy; nothing here is imported outside `approved/`.

export type LabType = 'tablet' | 'capsule' | 'liquid' | 'inhaler' | 'drops'
export type SharedState =
  'interval-setup' | 'clock-edit' | 'taken-change' | 'unscheduled' | 'today' | 'history'

type Rule = {
  /** The Quantity unit, singular. */
  unit: string
  plural: string
  step: number
}

export const typeRules: Record<LabType, Rule> = {
  tablet: {
    unit: 'tablet',
    plural: 'tablets',
    step: 0.5,
  },
  capsule: {
    unit: 'capsule',
    plural: 'capsules',
    step: 1,
  },
  liquid: {
    unit: 'ml',
    plural: 'ml',
    step: 0.1,
  },
  inhaler: {
    unit: 'puff',
    plural: 'puffs',
    step: 1,
  },
  drops: {
    unit: 'drop',
    plural: 'drops',
    step: 1,
  },
}

/** '1½' for tablets; '1.5' for Liquid; whole numbers otherwise. */
export function formatAmount(value: number, type: LabType) {
  if (type === 'tablet' && value % 1 === 0.5) return `${Math.floor(value) || ''}½`
  return String(Math.round(value * 10) / 10)
}

export function unitWord(value: number | null, type: LabType) {
  const rule = typeRules[type]
  return value !== null && value <= 1 ? rule.unit : rule.plural
}

/** '1.5 ml', '1 puff', '2 drops', joined by a no-break space so an amount never wraps apart. */
export function amountLabel(value: number, type: LabType) {
  return `${formatAmount(value, type)}\u00a0${unitWord(value, type)}`
}

/** The inline errors the frames show. */
export const amountErrors = {
  inhalerWhole: 'Use whole puffs.',
  dropsMin: 'Use 1 drop or more.',
}

/** Synthetic medications for the new types; ids end in digits that pick distinct tiles. */
export const examples = {
  liquid: { id: 'lab-liquid-2', label: 'Amoxicillin', strength: '250 mg/5 ml', type: 'liquid' },
  inhaler: {
    id: 'lab-inhaler-3',
    label: 'Salbutamol',
    strength: '100 mcg per puff',
    type: 'inhaler',
  },
  drops: { id: 'lab-drops-4', label: 'Eye drops', strength: '0.5%', type: 'drops' },
} as const satisfies Record<string, { id: string; label: string; strength: string; type: LabType }>

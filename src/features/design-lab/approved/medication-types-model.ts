// #265 lab-only values: the Medicine type and Quantity unit rules from
// docs/product/medication-domain.md#medicine-types-and-quantity-units, shaped for frames only.
// #266 owns the production policy; nothing here is imported outside `approved/`.

export type LabType = 'tablet' | 'capsule' | 'liquid' | 'inhaler' | 'drops'
export type AddState = 'unset' | 'menu' | 'liquid' | 'inhaler' | 'drops'
export type SharedState =
  | 'clock-setup'
  | 'interval-setup'
  | 'clock-edit'
  | 'taken'
  | 'taken-change'
  | 'unscheduled'
  | 'unscheduled-change'
  | 'today'
  | 'history'
  | 'detail'

type Rule = {
  label: string
  /** The Quantity unit, singular. */
  unit: string
  plural: string
  step: number
  /** Strength help once this Type is chosen. */
  help: string
}

/** Menu order is fixed: Tablet, Capsule, Liquid, Inhaler, Drops. */
export const typeRules: Record<LabType, Rule> = {
  tablet: {
    label: 'Tablet',
    unit: 'tablet',
    plural: 'tablets',
    step: 0.5,
    help: 'On the pack, e.g. 200 mg. Not your dose amount.',
  },
  capsule: {
    label: 'Capsule',
    unit: 'capsule',
    plural: 'capsules',
    step: 1,
    help: 'On the pack, e.g. 200 mg. Not your dose amount.',
  },
  liquid: {
    label: 'Liquid',
    unit: 'ml',
    plural: 'ml',
    step: 0.1,
    help: 'On the bottle, e.g. 250 mg/5 ml. Not your dose amount.',
  },
  inhaler: {
    label: 'Inhaler',
    unit: 'puff',
    plural: 'puffs',
    step: 1,
    help: 'On the inhaler, e.g. 100 mcg per puff. Not your dose amount.',
  },
  drops: {
    label: 'Drops',
    unit: 'drop',
    plural: 'drops',
    step: 1,
    help: 'On the bottle, e.g. 0.5%. Not your dose amount.',
  },
}

export const labTypes = Object.keys(typeRules) as LabType[]
export const unsetHelp = typeRules.tablet.help

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
  liquidStep: 'Use steps of 0.1 ml, like 1.2 ml.',
  liquidMin: 'Use 0.1 ml or more.',
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

import { formatQuantity, unitName } from '@/lib/quantity-policy'
import type { Medicine } from './contract'
import type { MedicineStockAction } from './use-medicine-stock'

export const stockCopy = {
  alert: 'Low-stock alert',
  alertTitle: (label: string) => `${label} low-stock alert`,
  alertLabel: 'Alert below',
  alertHelp: 'Shows when fewer than this are left.',
  heading: 'Stock',
  off: 'Not tracking',
  optionsTitle: (label: string) => `${label} stock`,
  stop: 'Stop tracking',
  refill: 'Add a refill',
  refillTitle: (label: string) => `Add ${label} refill`,
  refillBody: (plural: string) => `How many ${plural} did you get?`,
  refillLabel: 'Refill amount',
  refillHelp: 'Adds to your current count.',
  change: 'Change the count',
  changeTitle: (label: string) => `Change ${label} count`,
  currentLabel: 'Current count',
  currentHelp: "Doses taken before now won't change it.",
  pastCount: 'More was taken than counted. Change the count to fix it.',
  drawerTitle: (label: string) => `Track ${label} stock`,
  drawerBody: (plural: string) => `How many ${plural} do you have now?`,
  countLabel: 'Starting count',
  countHelp: 'Shows on this page and in Medications.',
  confirmTitle: (label: string) => `Stop tracking ${label} stock?`,
  confirmBody: (label: string) =>
    `Meddies stops counting ${label}. To track again, you’ll enter a fresh count.`,
}

const countSaveCopy = {
  rejected: 'Count wasn’t saved.',
  pending: 'Saving count...',
  retry: 'Try saving count again',
}

export const drawerCopy = {
  stockOn: { ...countSaveCopy, submit: 'Start tracking' },
  stockCorrection: { ...countSaveCopy, submit: 'Save count' },
  stockRefill: {
    submit: 'Add refill',
    pending: 'Adding refill...',
    rejected: 'Refill wasn’t added.',
    retry: 'Try adding refill again',
  },
  stockThreshold: {
    submit: 'Save alert',
    pending: 'Saving alert...',
    rejected: 'Alert wasn’t saved.',
    retry: 'Try saving alert again',
  },
  stockOff: {
    rejected: 'Stock tracking didn’t stop.',
    pending: 'Stopping...',
    retry: 'Retry stop',
    submit: stockCopy.stop,
  },
} satisfies Record<MedicineStockAction, unknown>

/** Threshold wording shared by the stock Drawer and both server-confirmed low notices. */
export function thresholdValue(medicine: Medicine) {
  const threshold = medicine.stock?.threshold
  return threshold === undefined
    ? null
    : `${formatQuantity(threshold, medicine.unit)} ${unitName(threshold, medicine.unit)}`
}

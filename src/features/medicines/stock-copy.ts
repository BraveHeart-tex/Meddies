import type { MedicineStockAction } from './use-medicine-stock'

export const stockCopy = {
  heading: 'Stock',
  off: 'Not tracking',
  optionsTitle: (label: string) => `${label} stock`,
  stop: 'Stop tracking',
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
  stockOff: {
    rejected: 'Stock tracking didn’t stop.',
    pending: 'Stopping...',
    retry: 'Retry stop',
    submit: stockCopy.stop,
  },
} satisfies Record<MedicineStockAction, unknown>

import type { CatalogMatch } from '@/features/catalog-products/contract'

/** #473 example lookups, shaped like the #196 result. Names stay as the catalog holds them. */
export const partialMatch: CatalogMatch = {
  outcome: 'match',
  name: 'DELIX FORTE',
  strength: '5 mg/5 mg',
  type: null,
  supportedForm: true,
}

export const nameOnlyMatch: CatalogMatch = {
  outcome: 'match',
  name: 'SYSTANE ULTRA',
  strength: null,
  type: null,
  supportedForm: true,
}

/** A cream: a form outside Tablet, Capsule, Liquid, Inhaler and Drops. */
export const unsupportedMatch: CatalogMatch = {
  outcome: 'match',
  name: 'HIRUDOID FORTE',
  strength: '0.445%',
  type: null,
  supportedForm: false,
}

export const scanFillCopy = {
  read: 'Barcode read',
  check: 'Check these match your pack',
  unsupportedNote:
    "Meddies doesn't track this form yet. You can still save it with the closest type.",
} as const

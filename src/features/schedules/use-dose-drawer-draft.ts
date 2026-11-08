'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { discardSessionFormDraft, readSessionDraft, writeSessionDraft } from '@/lib/session-drafts'
import type { DoseOutcomeRecord } from './contract'

type Outcome = DoseOutcomeRecord['outcome']

/**
 * Unsaved dose drawer details for the session (FE-674, FE-667 store): which outcome the open
 * drawer had chosen, and Taken values under `takenKey`. Navigation keeps them; explicit dismissal
 * and a confirmed save discard them.
 */
export function useDoseDrawerDraft(doseId: string) {
  const client = useQueryClient()
  const drawerKey = `dose-drawer:${doseId}`
  const takenKey = `dose-taken:${doseId}`
  const [initial] = useState(() => readSessionDraft<{ editor: Outcome | null }>(client, drawerKey))
  return {
    initial,
    takenKey,
    write(editor: Outcome | null) {
      writeSessionDraft(client, drawerKey, { editor })
    },
    discard() {
      discardSessionFormDraft(client, drawerKey)
      discardSessionFormDraft(client, takenKey)
    },
  }
}

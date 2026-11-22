'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { DetailCorrectionFields } from '@/features/medicines/detail-correction-fields'
import { medicineDetailsSchema } from '@/features/medicines/medicine-form-schema'
import { formatShortDay } from '@/lib/calendar-date'
import { SimpleCorrection } from './type-correction-simple'
import { TODAY } from '../lab-fixtures'
import { correctionMedicine } from './type-correction-model'
import { Frame, Nav } from './type-correction-parts'

const editSchema = medicineDetailsSchema.extend({
  expectedRevision: z.number(),
  date: z.string(),
  time: z.string(),
})
export function EditDetails() {
  const form = useForm<z.input<typeof editSchema>, unknown, z.output<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      label: 'Magnesium',
      strength: '200 mg',
      unit: 'capsule',
      expectedRevision: 4,
      date: '',
      time: '',
    },
  })
  const [review, setReview] = useState(false)
  if (review) return <SimpleCorrection strength="200 mg" onEditDetails={() => setReview(false)} />
  return (
    <Frame
      title="Edit details for this period"
      medicine={{ ...correctionMedicine, ...correctionMedicine.strengthRevisions[0] }}
    >
      <p className="text-body-sm text-muted-foreground">
        Earlier period · {formatShortDay('2026-10-01', TODAY)} to{' '}
        {formatShortDay('2026-10-31', TODAY)}. Name and strength change only for this period and its
        doses.
      </p>
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={form.handleSubmit(({ unit }) => {
          if (unit === 'capsule') setReview(true)
          else
            form.setError('root.example', { message: 'Choose Capsule to preview this correction.' })
        })}
      >
        <DetailCorrectionFields
          control={form.control}
          period={correctionMedicine.strengthRevisions[0]}
          locked={false}
          disabled={false}
          typeNote="Type and dose unit change throughout this medication, including every strength period, dose and saved schedule."
        />
        <FieldError>{form.formState.errors.root?.example?.message}</FieldError>
        <Button type="submit" size="lg">
          Review Type change
        </Button>
        <Nav href="/lab/440-s6">Cancel</Nav>
      </form>
    </Frame>
  )
}

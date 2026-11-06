'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AppHeader } from '@/components/layout/app-header'
import { MedicationTile } from './medication-tile'
import { parseMedicine, type Medicine } from './contract'

const UNIT_ITEMS = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
] as const

export function MedicinePanel({
  scheduleMode = 'list',
  scheduleMedicineId = '',
  detailMedicineId = '',
  initialNow = '',
}: {
  scheduleMode?: 'setup' | 'today' | 'list' | 'detail'
  scheduleMedicineId?: string
  detailMedicineId?: string
  initialNow?: string
}) {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [label, setLabel] = useState('')
  const [strength, setStrength] = useState('')
  const [savedMedicine, setSavedMedicine] = useState<Medicine | null>(null)
  const [unit, setUnit] = useState<'tablet' | 'capsule'>('tablet')
  const action = useRef<{ id: string; fingerprint: string } | null>(null)
  const lock = useRef(false)
  const mounted = useRef(true)
  const generation = useRef(0)
  const load = useCallback(async () => {
    const current = ++generation.current
    try {
      const response = await fetch('/api/medicines', {
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok) throw new Error('load')
      const data = await response.json()
      const loaded = data.medicines.map(parseMedicine)
      if (mounted.current && current === generation.current) {
        setMedicines(loaded)
        setLoadError(false)
      }
    } catch {
      if (mounted.current && current === generation.current) setLoadError(true)
    } finally {
      if (mounted.current && current === generation.current) setLoading(false)
    }
  }, [])
  function retryMedicines() {
    setLoading(true)
    setLoadError(false)
    void load()
  }
  useEffect(() => {
    mounted.current = true
    // load updates state only after the network settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    return () => {
      mounted.current = false
    }
  }, [load])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true
    setSaving(true)
    setMessage('')
    setError('')
    const fingerprint = JSON.stringify([label.trim(), strength.trim(), unit])
    if (!action.current || action.current.fingerprint !== fingerprint)
      action.current = { id: crypto.randomUUID(), fingerprint }
    try {
      const response = await fetch('/api/medicines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: action.current.id, label, strength, unit }),
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok) {
        setError(
          response.status === 401
            ? 'Your session ended. Sign in again to save your medicine.'
            : response.status === 400
              ? 'Check the medicine name, strength and unit, then try again.'
              : response.status === 409
                ? 'This save has different details already recorded. Reload your medicines before trying again.'
                : 'Save could not be confirmed. Your details are still here. Connect to the internet and retry.',
        )
        return
      }
      const data = await response.json()
      const saved = parseMedicine(data.medicines[0])
      if (!mounted.current) return
      setMedicines((previous) => [...previous.filter((item) => item.id !== saved.id), saved])
      setLabel('')
      setStrength('')
      setSavedMedicine(saved)
      action.current = null
      setMessage(`${saved.label} saved.`)
      // A fresh read includes older medicines even if the initial list was still pending.
      setLoadError(false)
      setLoading(true)
      void load()
    } catch {
      if (mounted.current)
        setError(
          'Save could not be confirmed. Your details are still here. Connect to the internet and retry.',
        )
    } finally {
      lock.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {scheduleMode !== 'today' && (
        <AppHeader
          title="Medications"
          subtitle={
            scheduleMode === 'list' && !loading && !loadError
              ? `${medicines.length} ${medicines.length === 1 ? 'medication' : 'medications'}`
              : undefined
          }
          action={
            scheduleMode === 'list' && (
              <Button
                nativeButton={false}
                className="rounded-full"
                render={<a href="#add-heading" aria-label="Add a medicine" />}
              >
                <Icon name="plus" data-icon="inline-start" />
                Add
              </Button>
            )
          }
        />
      )}
      <SchedulePanel
        initialNow={initialNow}
        medicines={medicines}
        mode={scheduleMode}
        initialMedicineId={scheduleMedicineId || detailMedicineId}
        medicinesLoading={loading}
        medicinesError={loadError}
        retryMedicines={retryMedicines}
      />
      {scheduleMode === 'detail' &&
        detailMedicineId &&
        medicines.some((item) => item.id === detailMedicineId) && (
          <Card
            role="region"
            aria-labelledby="medicine-detail"
            className="[overflow-wrap:anywhere]"
          >
            <CardHeader className="flex items-center gap-3.5">
              <MedicationTile medicineId={detailMedicineId} />
              <CardTitle>
                <h2 id="medicine-detail">
                  {medicines.find((item) => item.id === detailMedicineId)?.label}
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <p>
                Product strength:{' '}
                {medicines.find((item) => item.id === detailMedicineId)?.strength || 'Not provided'}
              </p>
              <p>Unit: {medicines.find((item) => item.id === detailMedicineId)?.unit}</p>
              <p className="text-label text-muted-foreground">
                Medicine details are saved and cannot be edited here.
              </p>
            </CardContent>
          </Card>
        )}
      {scheduleMode === 'list' && (
        <Card role="region" aria-labelledby="add-heading" className="scroll-mt-5">
          <CardHeader>
            <CardTitle>
              <h2 id="add-heading">Add a medicine</h2>
            </CardTitle>
            <CardDescription>
              Save online. You can add a medicine without a schedule.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="flex flex-col gap-5" aria-busy={saving}>
              <FieldSet disabled={saving} className="disabled:opacity-70">
                <FieldLegend className="sr-only">Medicine details</FieldLegend>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="medicine-label">Medicine name</FieldLabel>
                    <Input
                      id="medicine-label"
                      name="label"
                      autoComplete="off"
                      required
                      maxLength={120}
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      aria-describedby="medicine-name-help"
                    />
                    <FieldDescription id="medicine-name-help">
                      Use the name you recognize on your pack.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="medicine-strength">
                      Product strength{' '}
                      <span className="font-semibold text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Input
                      id="medicine-strength"
                      name="strength"
                      autoComplete="off"
                      maxLength={120}
                      value={strength}
                      onChange={(event) => setStrength(event.target.value)}
                      aria-describedby="medicine-strength-help"
                    />
                    <FieldDescription id="medicine-strength-help">
                      For example, 5 mg or 1000 IU. This describes the product, not how much you
                      take.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="medicine-unit">Unit</FieldLabel>
                    <Select
                      id="medicine-unit"
                      name="unit"
                      items={UNIT_ITEMS}
                      value={unit}
                      onValueChange={(value) => {
                        if (value) setUnit(value)
                      }}
                      disabled={saving}
                    >
                      <SelectTrigger aria-describedby="medicine-unit-help">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIT_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription id="medicine-unit-help">
                      Whole or half tablets, or whole capsules. No dose is set here.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </FieldSet>
              {error && (
                <Alert id="medicine-save-error" variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={saving}
                className="w-full whitespace-normal"
                aria-describedby={error ? 'medicine-save-error' : undefined}
              >
                {saving ? 'Saving medicine...' : error ? 'Retry saving medicine' : 'Save medicine'}
              </Button>
              <p role="status" className="text-body-sm [overflow-wrap:anywhere]">
                {message}
              </p>
            </form>
          </CardContent>
        </Card>
      )}
      {savedMedicine && (
        <section
          aria-label="Saved medicine"
          className="flex flex-col gap-3 [overflow-wrap:anywhere]"
        >
          <p role="status">{savedMedicine.label} is saved.</p>
          <div className="flex flex-wrap gap-2.5">
            <Button
              nativeButton={false}
              render={
                <a
                  href={`/medications?schedule=${encodeURIComponent(savedMedicine.id)}#schedule-heading`}
                />
              }
            >
              Set schedule
            </Button>
            <Button variant="outline" onClick={() => setSavedMedicine(null)}>
              Done for now
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

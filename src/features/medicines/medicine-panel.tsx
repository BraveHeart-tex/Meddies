'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { Button } from '@/components/ui/button'
import { parseMedicine, type Medicine } from './contract'

export function MedicinePanel({
  scheduleMode = 'list',
  scheduleMedicineId = '',
  detailMedicineId = '',
}: {
  scheduleMode?: 'setup' | 'today' | 'list' | 'detail'
  scheduleMedicineId?: string
  detailMedicineId?: string
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

  const field =
    'min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
  return (
    <div className="space-y-10">
      <SchedulePanel
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
          <section
            aria-labelledby="medicine-detail"
            className="space-y-2 rounded-xl border bg-card p-4 [overflow-wrap:anywhere]"
          >
            <h2 id="medicine-detail" className="text-xl font-semibold">
              {medicines.find((item) => item.id === detailMedicineId)?.label}
            </h2>
            <p>
              Product strength:{' '}
              {medicines.find((item) => item.id === detailMedicineId)?.strength || 'Not provided'}
            </p>
            <p>Unit: {medicines.find((item) => item.id === detailMedicineId)?.unit}</p>
            <p className="text-sm text-muted-foreground">
              Medicine details are saved and cannot be edited here.
            </p>
          </section>
        )}
      {scheduleMode === 'list' && (
        <section aria-labelledby="add-heading" className="space-y-5">
          <div className="space-y-2">
            <h2 id="add-heading" className="text-xl font-semibold">
              Add a medicine
            </h2>
            <p className="text-sm text-muted-foreground">
              Save online. You can add a medicine without a schedule.
            </p>
          </div>
          <form onSubmit={save} className="space-y-5" aria-busy={saving}>
            <fieldset disabled={saving} className="space-y-5 disabled:opacity-70">
              <legend className="sr-only">Medicine details</legend>
              <div className="space-y-2">
                <label htmlFor="medicine-label" className="block font-medium">
                  Medicine name
                </label>
                <input
                  id="medicine-label"
                  name="label"
                  autoComplete="off"
                  required
                  maxLength={120}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className={field}
                  aria-describedby="medicine-name-help"
                />
                <p id="medicine-name-help" className="text-sm text-muted-foreground">
                  Use the name you recognize on your pack.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="medicine-strength" className="block font-medium">
                  Product strength{' '}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="medicine-strength"
                  name="strength"
                  autoComplete="off"
                  maxLength={120}
                  value={strength}
                  onChange={(event) => setStrength(event.target.value)}
                  className={field}
                  aria-describedby="medicine-strength-help"
                />
                <p id="medicine-strength-help" className="text-sm text-muted-foreground">
                  For example, 5 mg or 1000 IU. This describes the product, not how much you take.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="medicine-unit" className="block font-medium">
                  Unit
                </label>
                <select
                  id="medicine-unit"
                  name="unit"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as 'tablet' | 'capsule')}
                  className={field}
                  aria-describedby="medicine-unit-help"
                >
                  <option value="tablet">Tablet</option>
                  <option value="capsule">Capsule</option>
                </select>
                <p id="medicine-unit-help" className="text-sm text-muted-foreground">
                  Whole or half tablets, or whole capsules. No dose is set here.
                </p>
              </div>
            </fieldset>
            {error && (
              <p id="medicine-save-error" role="alert" className="text-sm">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={saving}
              className="min-h-11 w-full whitespace-normal"
              aria-describedby={error ? 'medicine-save-error' : undefined}
            >
              {saving ? 'Saving medicine...' : error ? 'Retry saving medicine' : 'Save medicine'}
            </Button>
            <p role="status" className="text-sm [overflow-wrap:anywhere]">
              {message}
            </p>
          </form>
        </section>
      )}
      {savedMedicine && (
        <section aria-label="Saved medicine" className="space-y-3">
          <p role="status">{savedMedicine.label} is saved.</p>
          <div className="flex flex-wrap gap-3">
            <a
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground"
              href={`/medications?schedule=${encodeURIComponent(savedMedicine.id)}#schedule-heading`}
            >
              Set schedule
            </a>
            <Button variant="outline" className="min-h-11" onClick={() => setSavedMedicine(null)}>
              Done for now
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

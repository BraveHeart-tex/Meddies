'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { parseMedicine, type Medicine } from './contract'

export function MedicinePanel() {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [label, setLabel] = useState('')
  const [strength, setStrength] = useState('')
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
      if (mounted.current && current === generation.current) setMedicines(loaded)
    } catch {
      if (mounted.current && current === generation.current) setLoadError(true)
    } finally {
      if (mounted.current && current === generation.current) setLoading(false)
    }
  }, [])
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
      // Invalidate any earlier list response so it cannot hide a confirmed save.
      generation.current++
      setLoading(false)
      setMedicines((previous) => [...previous.filter((item) => item.id !== saved.id), saved])
      setLabel('')
      setStrength('')
      action.current = null
      setMessage(`${saved.label} saved.`)
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
      <section aria-labelledby="medicines-heading" className="space-y-4">
        <h2 id="medicines-heading" className="text-2xl font-semibold tracking-tight">
          Your medicines
        </h2>
        {loading ? (
          <p role="status">Loading your medicines...</p>
        ) : loadError ? (
          <div className="space-y-3">
            <p role="alert">
              Your medicines could not be loaded. Connect to the internet and try again.
            </p>
            <Button
              className="min-h-11 whitespace-normal"
              variant="outline"
              onClick={() => {
                setLoading(true)
                setLoadError(false)
                void load()
              }}
            >
              Retry loading medicines
            </Button>
          </div>
        ) : medicines.length === 0 ? (
          <p className="text-muted-foreground">Start with a name and the unit on your pack.</p>
        ) : null}
        {medicines.length > 0 && (
          <ul className="divide-y border-y">
            {medicines.map((medicine) => (
              <li key={medicine.id} className="space-y-1 py-4 [overflow-wrap:anywhere]">
                <h3 className="font-semibold">{medicine.label}</h3>
                {medicine.strength && (
                  <p className="text-sm">Product strength: {medicine.strength}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {medicine.unit === 'tablet' ? 'Tablet' : 'Capsule'} · No schedule
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
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
    </div>
  )
}

'use client'

import { Button } from '@/components/ui/button'

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">Meddies couldn’t open</h1>
      <p role="alert">Please check your connection and try again.</p>
      <Button onClick={retry} className="min-h-11">
        Try again
      </Button>
    </main>
  )
}

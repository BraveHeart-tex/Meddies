'use client'

import { TriangleAlert } from 'lucide-react'
import localFont from 'next/font/local'
import '@/global.css'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const nunito = localFont({
  src: './fonts/nunito-variable.ttf',
  weight: '200 1000',
  variable: '--font-sans',
  display: 'swap',
})

// Replaces the root layout: no router, session, toast or other layout provider is required.
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en" className={nunito.variable}>
      <head>
        <title>Meddies</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-5 px-5 pt-[calc(2rem+env(safe-area-inset-top,0px))] pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
          <h1 className="text-display font-extrabold">Meddies</h1>
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>This page couldn&apos;t open.</AlertTitle>
            <AlertDescription>Your records haven&apos;t changed.</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
            {/* Root recovery must work without a functioning client router. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className={cn(buttonVariants({ variant: 'ghost' }))}>
              Open Today
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}

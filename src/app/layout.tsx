import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@/global.css'
import { Inter } from 'next/font/google'
import { cn } from '@/lib/utils'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Meddies',
  description: 'Meddies is being built.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', inter.variable)}>
      <body>{children}</body>
    </html>
  )
}

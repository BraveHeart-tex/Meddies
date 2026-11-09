import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@/global.css'
import localFont from 'next/font/local'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/toast'

const nunito = localFont({
  src: './fonts/nunito-variable.ttf',
  weight: '200 1000',
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Meddies',
  description: 'Your private medication routine.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Meddies',
    startupImage: [
      {
        url: '/launch-screen-iphone-17.png',
        media:
          '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
    ],
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  themeColor: '#fbf5ee',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', nunito.variable)}>
      <body>
        <Toaster>{children}</Toaster>
      </body>
    </html>
  )
}

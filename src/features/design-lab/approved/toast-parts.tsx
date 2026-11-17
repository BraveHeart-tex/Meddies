'use client'

import type { CSSProperties, ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToastIcon } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type { LabToast } from './toast-model'

/**
 * #371 lab-only floating Toasts. They mirror the production Toast look (cocoa fill, status glyph
 * chip, `shadow-toast`) as static markup, so a frame can hold one mid-swipe or expanded. The host
 * sits where `ToastViewport` does: above the floating bottom nav.
 */

const shape = 'rounded-lg py-2 pr-1 pl-3.5'

function Close() {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Dismiss"
      className="shrink-0 text-primary-foreground/75 hover:bg-primary-foreground/12 hover:text-primary-foreground focus-visible:outline-accent"
    >
      <X aria-hidden="true" />
    </Button>
  )
}

/** One Toast, every one with its 44px Dismiss button. */
export function LabToastCard({
  toast,
  style,
  className,
}: {
  toast: LabToast
  style?: CSSProperties
  className?: string
}) {
  const glyph = toast.glyph === 'check' ? <ToastIcon type="success" /> : null
  const text = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="text-body-sm font-bold wrap-anywhere">{toast.title}</p>
      {toast.detail && (
        <p className="text-label font-semibold text-primary-foreground/75">{toast.detail}</p>
      )}
    </div>
  )
  return (
    <div
      role="status"
      style={style}
      className={cn(
        'pointer-events-auto relative w-full bg-foreground text-primary-foreground shadow-toast',
        shape,
        className,
      )}
    >
      <div className="flex min-h-11 items-center gap-2.5">
        {glyph}
        {text}
        <Close />
      </div>
    </div>
  )
}

/** The Toast host, fixed above the bottom nav like `ToastViewport`. */
export function LabToastHost({ children }: { children: ReactNode }) {
  return (
    <div
      data-lab-toast-host
      className="pointer-events-none fixed inset-x-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom,0px))+5rem)] z-50 mx-auto max-w-2xl"
    >
      {children}
    </div>
  )
}

/** A dashed lab note pinned to the top of the frame: behavior a still image can't show. */
export function LabNote({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-4 top-[calc(0.5rem+env(safe-area-inset-top,0px))] z-50 mx-auto max-w-2xl rounded-md border border-dashed border-foreground/40 bg-background px-3 py-2 text-label font-semibold text-foreground">
      {children}
    </div>
  )
}

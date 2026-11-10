'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Keeps a full-screen form's Alert and primary action in reach at the bottom (767·A2). Place it
 * last in a `px-5` column; a hairline shows only while content scrolls beneath it.
 */
export function StickyActions({ children }: { children: ReactNode }) {
  const end = useRef<HTMLDivElement>(null)
  const [covering, setCovering] = useState(false)
  useEffect(() => {
    const target = end.current
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => setCovering(!entry.isIntersecting))
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  return (
    <>
      <div ref={end} aria-hidden="true" className="-mt-5 h-px" />
      <div
        data-covering={covering || undefined}
        className="sticky bottom-0 z-10 -mx-5 mt-auto flex flex-col gap-3 border-t border-transparent bg-background px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] data-covering:border-border"
      >
        {children}
      </div>
    </>
  )
}

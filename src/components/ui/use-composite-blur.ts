'use client'

import * as React from 'react'

/**
 * Blur for a control made of several elements, some in portaled popups. Pass each element to
 * `track` (a ref callback) and give it `onPartBlur` as its blur handler. `leave` runs once focus
 * settles outside every part, not when focus moves between parts, so opening a popup does not
 * mark a form field touched.
 */
export function useCompositeBlur(leave: (() => void) | undefined) {
  const parts = React.useRef(new Set<HTMLElement>())
  const latest = React.useRef(leave)
  React.useEffect(() => {
    latest.current = leave
  })

  const track = React.useCallback((node: HTMLElement | null) => {
    if (!node) return
    parts.current.add(node)
    return () => {
      parts.current.delete(node)
    }
  }, [])

  const pending = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  React.useEffect(() => () => clearTimeout(pending.current), [])

  // Call on each part's blur, and when a popup closes: a popup removed while it holds focus may
  // never fire blur.
  const onPartBlur = React.useCallback(() => {
    // Focus may pass through <body> while a popup closes and returns it to its trigger, so wait
    // for it to settle before deciding it left.
    clearTimeout(pending.current)
    pending.current = setTimeout(() => {
      const active = document.activeElement
      const inside = [...parts.current].some((node) => node.contains(active))
      if (!inside) latest.current?.()
    })
  }, [])

  return { track, onPartBlur }
}

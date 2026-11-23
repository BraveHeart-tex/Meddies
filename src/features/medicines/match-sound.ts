'use client'

import { useEffect, useMemo, useRef } from 'react'

/** Made by docs/brand/scan_sounds.py; peaks at -6 dBFS. */
const matchSoundUrl = '/sounds/scan-match.wav'
const matchSoundGain = 0.6

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } }

function ignore() {}

/**
 * The match sound (docs/product/catalog-barcode.md#scope), "Two capsules": played from Web Audio
 * when a scan finds a Catalog match. The ambient audio session keeps it silent under the iPhone
 * silent switch and mixes it with music. Not ready, blocked or failed to decode, it stays silent;
 * nothing here throws or makes the caller wait.
 */
export function useMatchSound() {
  const context = useRef<AudioContext | null>(null)
  const buffer = useRef<AudioBuffer | null>(null)
  const loading = useRef(false)

  useEffect(
    () => () => {
      void context.current?.close().catch(ignore)
      context.current = null
      buffer.current = null
      loading.current = false
    },
    [],
  )

  return useMemo(() => {
    /** In a tap handler: iOS starts audio only from a user gesture. */
    function unlock() {
      try {
        if (!context.current) {
          if (typeof AudioContext === 'undefined') return
          const session = (navigator as AudioSessionNavigator).audioSession
          if (session) session.type = 'ambient'
          context.current = new AudioContext()
        }
        if (context.current.state !== 'running') void context.current.resume().catch(ignore)
      } catch {
        // No audio for this Scanner; the match still fills.
      }
    }

    /** On a tap that opens the Scanner: unlocks audio, then loads and decodes the sound once. */
    function prepare() {
      unlock()
      const audio = context.current
      if (!audio || buffer.current || loading.current) return
      loading.current = true
      fetch(matchSoundUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`Match sound ${response.status}`)
          return response.arrayBuffer()
        })
        .then((data) => audio.decodeAudioData(data))
        .then((decoded) => {
          if (context.current === audio) buffer.current = decoded
        })
        .catch(() => {
          // The next Scanner open tries again.
          loading.current = false
        })
    }

    function play() {
      const audio = context.current
      if (!audio || !buffer.current || audio.state !== 'running') return
      try {
        const source = audio.createBufferSource()
        source.buffer = buffer.current
        const gain = audio.createGain()
        gain.gain.value = matchSoundGain
        source.connect(gain).connect(audio.destination)
        source.start()
      } catch {
        // Silent, like a sound that never loaded.
      }
    }

    return { prepare, unlock, play }
  }, [])
}

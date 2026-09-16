import { useEffect, useState } from 'react'

import { N_DRUM_VOICES, voiceBit } from '../drums'
import { engine } from '../engine/engine'

// How long a row or pad stays lit after a hit: long enough to see at a glance,
// and short enough that sixteenth hats still flash sixteen times.
const FLASH_MS = 110

// Which voices are lit, as a mask in step bit order, from the hits the kit
// reports. The report includes hits from the mic on the trigger line, a bridged
// patch, a pad and the retrigger bend, which can land on any step.
//
// The meter posts sixty times a second and most posts carry no hits, so the
// hook compares the mask before setting it, and an unchanged mask causes no
// render.
export function useStruck(): number {
  const [lit, setLit] = useState(0)
  useEffect(() => {
    const at = new Float64Array(N_DRUM_VOICES)
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = () => {
      const now = performance.now()
      let bits = 0
      for (let v = 0; v < N_DRUM_VOICES; v++)
        if (now - at[v]! < FLASH_MS) bits |= voiceBit(v)
      setLit(bits)
      // A kit that stops reporting — the engine suspended, the page hidden —
      // would otherwise leave whatever was lit at that moment lit for ever.
      clearTimeout(timer)
      if (bits !== 0) timer = setTimeout(settle, FLASH_MS)
    }
    const off = engine.meter.subscribe(() => {
      const hits = engine.meter.get().hits
      if (hits !== 0) {
        const now = performance.now()
        for (let v = 0; v < N_DRUM_VOICES; v++)
          if (hits & voiceBit(v)) at[v] = now
      }
      settle()
    })
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [])
  return lit
}

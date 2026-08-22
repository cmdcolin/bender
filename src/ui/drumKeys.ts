// The kit's keys, the way the toy keyboard has letters: one number per voice,
// in the bit order of a step.
//
// The kit had no pads. Every other way of striking it — the mic soldered to the
// trigger line, a bridged patch, the retrigger bend, a controller — reaches the
// trigger line from somewhere else on the board, and the only thing a hand
// could do unaided was click one row's name at a time. That is enough to hear a
// voice and nowhere near enough to play a bar into the pattern, which left
// record armed with nothing to record.
//
// Read off the physical key rather than the character it prints: a row of pads
// is where the fingers are, and on a layout that shifts for its digits the
// character is not what was pressed.

import { N_DRUM_VOICES, voiceBit } from '../drums'
import { engine } from '../engine/engine'
import { useEffect } from 'react'

// Where a keypress belongs to the control rather than to the kit.
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** The number printed on a voice's pad, which is its place in the kit. */
export const padKeyFor = (voice: number) => String(voice + 1)

/** Which voice a physical key strikes, or -1 for a key that is not a pad. The
    number row and the pad on a numeric keypad alike — both are a row of digits
    under a hand, and a kit is played with whichever one you have. */
export function padVoice(code: string): number {
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  const voice = digit ? Number(digit[1]) - 1 : -1
  return voice >= 0 && voice < N_DRUM_VOICES ? voice : -1
}

/** The pads, live for as long as the app is up — the kit answers a finger
    wherever the panel happens to be, exactly as the toy keyboard's letters do. */
export function useDrumKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // A held pad is one hit. The kit has a bend for hammering a step at audio
      // rate and it is not the operating system's key repeat.
      if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement
        if (!TYPING.has(target.tagName)) {
          const voice = padVoice(e.code)
          if (voice >= 0) engine.drumHit(voiceBit(voice))
        }
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])
}

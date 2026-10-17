import type { KeyboardEvent } from 'react'

// Enter and Space on a focused key hold it down until they come up, the way a
// pointer does. Space stops here rather than reaching the window's run line.
const PRESS_KEYS = new Set(['Enter', ' '])

const claim = (e: KeyboardEvent) => {
  if (!PRESS_KEYS.has(e.key)) return false
  e.preventDefault()
  e.stopPropagation()
  return true
}

/** Whether a keydown presses the focused key. */
export const claimPress = (e: KeyboardEvent) => claim(e) && !e.repeat

/** Whether a keyup lets the focused key go. */
export const claimRelease = claim

import { useEffect, useLayoutEffect, useState } from 'react'

// How wide a thing actually came out, for the layouts CSS can decide and the
// component has to. A media query answers a question about the window, and the
// keybed's question is about its case: the panel beside it is 470 fixed pixels
// of that window, and the FM board never grows past 380 of what is left, so two
// beds in the same window have very different room for keys.
//
// Undefined until it has been measured, which is one frame. What to draw in the
// meantime is the caller's business — the keybed draws the whole board, because
// three octaves is the keyboard and the short one is the fallback.
export function useWidth(el: Element | null) {
  const [width, setWidth] = useState<number>()
  useLayoutEffect(() => {
    if (el) {
      const observer = new ResizeObserver(() => setWidth(el.clientWidth))
      observer.observe(el)
      return () => observer.disconnect()
    }
  }, [el])
  return width
}

const COARSE = '(pointer: coarse)'

// Whether the thing doing the pointing is a finger. Width does not say it — a
// tablet is as wide as a laptop, and a laptop in a narrow window is not a phone
// — and it is the half of "narrow" that decides how big a key has to be rather
// than how many of them fit.
export function useCoarse() {
  const [coarse, setCoarse] = useState(() => window.matchMedia(COARSE).matches)
  useEffect(() => {
    const query = window.matchMedia(COARSE)
    const change = () => setCoarse(query.matches)
    change()
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return coarse
}

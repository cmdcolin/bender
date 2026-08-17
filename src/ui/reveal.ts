import { useEffect } from 'react'

const EVENT = 'bender:reveal'

export function revealGroup(id: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }))
}

export function useRevealed(id: string, onReveal: () => void) {
  useEffect(() => {
    const listener = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) onReveal()
    }
    window.addEventListener(EVENT, listener)
    return () => window.removeEventListener(EVENT, listener)
  })
}

function scrollParent(el: HTMLElement): HTMLElement | undefined {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return undefined
}

// Scrolls the panel, and only as far as it takes to put the section on screen:
// scrollIntoView drags the whole document along, which reads as the page
// jumping. Under the narrow layout the page is the scroller, so it moves.
export function scrollIntoPanel(el: HTMLElement) {
  const panel = scrollParent(el)
  if (!panel) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    return
  }
  const box = el.getBoundingClientRect()
  const view = panel.getBoundingClientRect()
  const above = box.top - view.top - 8
  const below = box.bottom - view.bottom + 8
  const delta = above < 0 ? above : below > 0 ? Math.min(below, above) : 0
  if (delta) panel.scrollTo({ top: panel.scrollTop + delta, behavior: 'smooth' })
}

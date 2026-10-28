import { useState } from 'react'

import { createStore } from '../listeners.ts'
import { useStoreValue } from './ControlsContext.ts'

function scrollParent(el: HTMLElement): HTMLElement | undefined {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      p.scrollHeight > p.clientHeight
    )
      return p
  }
  return undefined
}

// How much of the top of the view sticky siblings cover, so a section's heading
// does not come to rest underneath them.
function pinnedAbove(el: HTMLElement): number {
  const siblings = el.parentElement ? [...el.parentElement.children] : []
  return siblings
    .filter(
      (c): c is HTMLElement =>
        c instanceof HTMLElement && getComputedStyle(c).position === 'sticky',
    )
    .reduce((h, c) => h + c.offsetHeight, 0)
}

// Scrolls the panel, and only as far as it takes to put the section on screen:
// scrollIntoView drags the whole document along, which reads as the page
// jumping. Under the narrow layout the page is the scroller, so it moves — by
// the same arithmetic, against the window, since scrollIntoView knows nothing
// of what is pinned over the top of it. Before the first press or key the page
// stays put, so a stage restored or opened by the starter board leaves a fresh
// tab at the top.
export function scrollIntoPanel(el: HTMLElement) {
  const panel = scrollParent(el)
  if (!panel && !navigator.userActivation?.hasBeenActive) return
  const box = el.getBoundingClientRect()
  const view = panel
    ? panel.getBoundingClientRect()
    : { top: 0, bottom: window.innerHeight }
  const above = box.top - view.top - pinnedAbove(el) - 8
  const below = box.bottom - view.bottom + 8
  const delta = above < 0 ? above : below > 0 ? Math.min(below, above) : 0
  if (delta) {
    if (panel)
      panel.scrollTo({ top: panel.scrollTop + delta, behavior: 'smooth' })
    else window.scrollBy({ top: delta, behavior: 'smooth' })
  }
}

const AIM_MS = 1200

export const aimed = createStore<{ key: string; at: number } | null>(null)

const FRESH_AIM_MS = 1000

export function useOnAim(act: (key: string) => void) {
  const aim = useStoreValue(aimed)
  const [taken, setTaken] = useState(() =>
    aim && performance.now() - aim.at < FRESH_AIM_MS ? null : aim,
  )
  if (aim === taken) return
  setTaken(aim)
  if (aim) act(aim.key)
}

/** Scrolls to the row of `key` and flashes it, two frames on so a stage that
    has just opened has laid itself out. */
export function aimAt(key: string, from: Element | null = null) {
  aimed.set({ key, at: performance.now() })
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const row = (
        from?.closest('aside') ?? document
      ).querySelector<HTMLElement>(`[data-control="${key}"]`)
      if (!row) return
      scrollIntoPanel(row)
      row.dataset.aimed = ''
      setTimeout(() => delete row.dataset.aimed, AIM_MS)
    }),
  )
}

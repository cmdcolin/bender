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

// How much of the top of the view a pinned sibling is standing in. The panel's
// nameplate and verbs stick to the top of its scroll, so the top edge of the
// view is not where a section becomes visible: aligned to the edge itself, its
// heading would come to rest underneath them.
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
// of what is pinned over the top of it.
export function scrollIntoPanel(el: HTMLElement) {
  const panel = scrollParent(el)
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

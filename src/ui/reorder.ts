// Insertion, not a swap. A chain is a list, and the move you mean when you drag
// the filter above the crusher is "put it here and let the rest close up" —
// swapping would move a second stage you never touched, which on a signal path
// is two edits for one gesture.
//
// Both racks work this way, and they have to work the same way: the bends and
// the pedals are one column on the drawing, and a drag that means one thing in
// the top half and another in the bottom is a drawing that lies about itself.
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  const [taken] = next.splice(from, 1)
  next.splice(to, 0, taken!)
  return next
}

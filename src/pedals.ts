// The pedal board, shared by the audio thread and the panel the way the kit and
// the memory are.
//
// The bends are six sockets you put stages into, and a socket can be empty or
// hold the same stage twice. The pedals are not that: there are five of them,
// all five are always on the board, and the only question is what order the
// signal meets them in. So the whole of it is one control naming one of the
// hundred and twenty orders, rather than five sockets that could disagree — a
// roll, a link and a preset all reach it, and none of them can leave it saying
// something that is not an order.
//
// Turning a pedal off is what its own mix or level is for, and that has not
// changed: at zero it is on the board and out of the path.

export const PEDALS = [
  { group: 'Stompbox', label: 'stomp' },
  { group: 'Tape delay', label: 'tape' },
  { group: 'Delay pedal', label: 'echo' },
  { group: 'Spring verb', label: 'verb' },
  { group: 'Ensemble', label: 'ens' },
] as const

// Lexicographic, and pinned by pedals.test.ts. A packed link says "order 9", so
// the day this list is generated a different way every link ever made quietly
// decodes to a different board — the same bargain the wire order in packed.ts
// makes, for the same reason.
function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((head, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [
      head,
      ...rest,
    ]),
  )
}

// Which is what the fifth pedal had to be built around. There used to be
// twenty-four orders and every link in the world numbered against them, so the
// hundred and twenty are dealt in two halves: the orders that end in the
// ensemble first, which are the old twenty-four with the new box bolted on the
// end of each and in exactly the order they were in, and then the ninety-six
// that put it anywhere else. Order 9 is still order 9, and everything it named
// still runs where it ran, with the ensemble added downstream of the lot.
const ALL = permutations([0, 1, 2, 3, 4])
const LAST = PEDALS.length - 1

export const PEDAL_ORDERS: readonly (readonly number[])[] = [
  ...ALL.filter(o => o.at(-1) === LAST),
  ...ALL.filter(o => o.at(-1) !== LAST),
]

/** The order a `pedalOrder` value names — the board's own, for anything out of
    range, since a pedal that stopped being in the path would be a link that
    arrived with a piece of the board missing. */
export const pedalOrderAt = (v: number): readonly number[] =>
  PEDAL_ORDERS[Math.round(v)] ?? PEDAL_ORDERS[0]!

/** What the choice list reads: the five pedals in the order they run. */
export const PEDAL_ORDER_NAMES = PEDAL_ORDERS.map(o =>
  o.map(i => PEDALS[i]!.label).join(' → '),
)

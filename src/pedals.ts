// The pedal board, shared by the audio thread and the panel the way the kit and
// the memory are.
//
// The bends are six sockets you put stages into, and a socket can be empty or
// hold the same stage twice. The pedals are not that: there are six of them,
// all six are always on the board, and the only question is what order the
// signal meets them in. So the whole of it is one control naming one of the
// seven hundred and twenty orders, rather than six sockets that could disagree — a
// roll, a link and a preset all reach it, and none of them can leave it saying
// something that is not an order.
//
// Turning a pedal off is what its own mix or level is for, and that has not
// changed: at zero it is on the board and out of the path.

export const PEDALS = [
  { group: 'Gnash', label: 'stomp' },
  { group: 'Wraith', label: 'tape' },
  { group: 'Ricochet', label: 'echo' },
  { group: 'Boing', label: 'verb' },
  { group: 'Chorale', label: 'ens' },
  { group: 'Ember', label: 'amp' },
] as const

export const isPedal = (stage: string) => PEDALS.some(p => p.group === stage)

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

// The orders a link made before the amp numbered against: the hundred and
// twenty of five pedals, dealt with the ones that end in the ensemble first.
const FIVE = permutations([0, 1, 2, 3, 4])
const FIVE_ORDERS = [
  ...FIVE.filter(o => o.at(-1) === 4),
  ...FIVE.filter(o => o.at(-1) !== 4),
]

// Every one of those, in the order it was in, with the amp bolted on the end,
// and then the six hundred that put it anywhere else. Order 9 is still order 9,
// and everything it named still runs where it ran, with the amp downstream of
// the lot.
const ALL = permutations([0, 1, 2, 3, 4, 5])
const LAST = PEDALS.length - 1

export const PEDAL_ORDERS: readonly (readonly number[])[] = [
  ...FIVE_ORDERS.map(o => [...o, LAST]),
  ...ALL.filter(o => o.at(-1) !== LAST),
]

/** The order a `pedalOrder` value names — the board's own, for anything out of
    range, since a pedal that stopped being in the path would be a link that
    arrived with a piece of the board missing. */
export const pedalOrderAt = (v: number): readonly number[] =>
  PEDAL_ORDERS[Math.round(v)] ?? PEDAL_ORDERS[0]!

/** What the choice list reads: the six pedals in the order they run. */
export const PEDAL_ORDER_NAMES = PEDAL_ORDERS.map(o =>
  o.map(i => PEDALS[i]!.label).join(' → '),
)

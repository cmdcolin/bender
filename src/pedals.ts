import type { ControlKey } from './controls.ts'

interface Pedal {
  group: string
  label: string
  mute: ControlKey
  mix: ControlKey
}

export const PEDALS = [
  { group: 'Gnash', label: 'stomp', mute: 'stompMute', mix: 'stompMix' },
  { group: 'Wraith', label: 'tape', mute: 'dlyMute', mix: 'dlyMix' },
  { group: 'Ricochet', label: 'echo', mute: 'echoMute', mix: 'echoLevel' },
  { group: 'Boing', label: 'verb', mute: 'revMute', mix: 'revMix' },
  { group: 'Chorale', label: 'ens', mute: 'ensMute', mix: 'ensMix' },
  { group: 'Ember', label: 'amp', mute: 'ampMute', mix: 'ampMix' },
] as const satisfies readonly Pedal[]

export const pedalNamed = (stage: string): Pedal | undefined =>
  PEDALS.find(p => p.group === stage)

export const isPedal = (stage: string) => pedalNamed(stage) !== undefined

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((head, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [
      head,
      ...rest,
    ]),
  )
}

const FIVE = permutations([0, 1, 2, 3, 4])
const FIVE_ORDERS = [
  ...FIVE.filter(o => o.at(-1) === 4),
  ...FIVE.filter(o => o.at(-1) !== 4),
]

const ALL = permutations([0, 1, 2, 3, 4, 5])
const LAST = PEDALS.length - 1

export const PEDAL_ORDERS: readonly (readonly number[])[] = [
  ...FIVE_ORDERS.map(o => [...o, LAST]),
  ...ALL.filter(o => o.at(-1) !== LAST),
]

export const pedalOrderAt = (v: number): readonly number[] =>
  PEDAL_ORDERS[Math.round(v)] ?? PEDAL_ORDERS[0]!

export const pedalOrderOf = (order: readonly number[]) =>
  PEDAL_ORDERS.findIndex(o => o.every((v, i) => v === order[i]))

export const PEDAL_ORDER_NAMES = PEDAL_ORDERS.map(o =>
  o.map(i => PEDALS[i]!.label).join(' → '),
)

import { describe, expect, it } from 'vitest'

import { DEFAULT_CONTROLS, type ControlKey } from '../controls.ts'
import * as wiring from './cardWiring.ts'
import { TRACK_NUMBERS } from './controls/index.ts'
import { besideOf, rowShown, type Opens, type Wiring } from './diagram.ts'

const shown = (keys: readonly ControlKey[]) =>
  keys.filter(k => rowShown(k, DEFAULT_CONTROLS)).length

const DRAWINGS: [string, Opens, Wiring][] = [
  ['Clipper', wiring.CLIPPER_OPENS, wiring.CLIPPER_WIRED],
  ['Parlor', wiring.PARLOR_OPENS, wiring.PARLOR_WIRED],
  ['Wraith', wiring.WRAITH_OPENS, wiring.WRAITH_WIRED],
  ['trigger patch', wiring.TRIGGER_OPENS, wiring.TRIGGER_WIRED],
  ...TRACK_NUMBERS.map((t): [string, Opens, Wiring] => [
    `Layercake track ${t}`,
    wiring.stripOpens(t),
    wiring.STRIP_WIRED,
  ]),
]

describe.each(DRAWINGS)('%s cards', (_, opens, wired) => {
  const all = shown([...new Set(Object.values(opens).flat())])

  it.each(Object.keys(opens))('%s shows at least three rows', id => {
    const beside = besideOf(opens, wired, id)
    expect(
      shown([...opens[id]!, ...(beside?.keys ?? [])]),
    ).toBeGreaterThanOrEqual(Math.min(3, all))
  })

  it('wires only to boxes it draws', () => {
    for (const [id, names] of Object.entries(wired))
      expect([id, ...names].filter(n => !(n in opens))).toEqual([])
  })
})

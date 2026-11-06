import { JACK_TAPS } from '../../jacks.ts'
import { PEDALS } from '../../pedals.ts'
import { BENDS } from './bends.ts'
import { CHANNELS } from './mix.ts'

import type { ControlKey } from '../../controls.ts'
import type { Group, SliderDef } from './types.ts'

export const MASTER = 'master'

/** What each value of a Patched into control names: the master run, then the
    machines under the names the desk gives them. */
export const JACK_NAMES: string[] = JACK_TAPS.map(t =>
  t < 0 ? MASTER : (CHANNELS.find(c => c.tap === t)?.name ?? `tap ${t}`),
)

/** The bends and pedals, each with its jack, in the racks' order. */
export const UNITS: readonly { group: string; into: ControlKey }[] = [
  ...BENDS,
  ...PEDALS,
]

const INTO_OF = new Map(UNITS.map(u => [u.group, u.into]))

export const intoOf = (stage: string): ControlKey | undefined =>
  INTO_OF.get(stage)

/** The machine a unit is patched into, or undefined on the master run. */
export const patchedInto = (value: number): string | undefined => {
  const name = JACK_NAMES[Math.round(value)]
  return name === MASTER ? undefined : name
}

const jackSlider = (key: ControlKey, stage: string): SliderDef => ({
  key,
  label: 'Patched into',
  min: 0,
  max: JACK_NAMES.length - 1,
  step: 1,
  unit: '',
  choices: JACK_NAMES,
  menu: true,
  help: `Cables ${stage} onto one machine’s output instead of the master run, so it processes that machine alone before the mix bus. bender.set({ ${key}: 'Clatter' })`,
})

export const withJack = (g: Group): Group => {
  const into = intoOf(g.name)
  return into ? { ...g, sliders: [...g.sliders, jackSlider(into, g.name)] } : g
}

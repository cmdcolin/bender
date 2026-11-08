import { ALL_LINES, JACK_TAPS, lineList, lineOf } from '../../jacks.ts'
import { PEDALS } from '../../pedals.ts'
import { BEND_SLOT_KEYS, bendAt, BENDS } from './bends.ts'
import { CHANNELS } from './mix.ts'

import type { ControlKey, Controls } from '../../controls.ts'
import type { Group, SliderDef } from './types.ts'

export const MASTER = 'master'

const tapName = (t: number) =>
  t < 0 ? MASTER : (CHANNELS.find(c => c.tap === t)?.name ?? `tap ${t}`)

export const JACK_NAMES: string[] = JACK_TAPS.map(tapName)

export const LINE_NAMES: string[] = JACK_NAMES.slice(1)

export const UNITS: readonly { group: string; into: ControlKey }[] = [
  ...BENDS,
  ...PEDALS,
]

const INTO_OF = new Map(UNITS.map(u => [u.group, u.into]))

export const intoOf = (stage: string): ControlKey | undefined =>
  INTO_OF.get(stage)

export const linesNamed = (value: number): string[] =>
  lineList(value).map(tapName)

export const linesText = (value: number) => {
  const names = linesNamed(value)
  return names.length > 0 ? names.join(' + ') : MASTER
}

export const lineNamed = (name: string) => {
  const t = JACK_TAPS[JACK_NAMES.indexOf(name)]
  return t === undefined || t < 0 ? 0 : lineOf(t)
}

function lineMatching(word: string) {
  const exact = LINE_NAMES.find(n => n.toLowerCase() === word)
  const prefixed = LINE_NAMES.filter(n => n.toLowerCase().startsWith(word))
  const name = exact ?? (prefixed.length === 1 ? prefixed[0] : undefined)
  if (name === undefined)
    throw new Error(
      `${prefixed.length > 1 ? `'${word}' matches ${prefixed.join(' and ')}` : `no machine matches '${word}'`}; the lines are ${MASTER}, ${LINE_NAMES.join(', ')}`,
    )
  return lineNamed(name)
}

export function parseLines(text: string) {
  const words = text
    .split(/[+,]/)
    .map(w => w.trim().toLowerCase())
    .filter(Boolean)
  return words.length === 0 || (words.length === 1 && words[0] === MASTER)
    ? 0
    : words.reduce((mask, w) => mask | lineMatching(w), 0)
}

export const patchedInto = (value: number): string | undefined => {
  const names = linesNamed(value)
  return names.length > 0 ? names.join(' + ') : undefined
}

export const bendRuns = (c: Controls, group: string) => {
  const bend = BENDS.find(b => b.group === group)
  return (
    bend !== undefined &&
    (patchedInto(c[bend.into]) !== undefined ||
      BEND_SLOT_KEYS.some(k => bendAt(c[k])?.group === group))
  )
}

const jackSlider = (key: ControlKey, stage: string): SliderDef => ({
  key,
  label: 'Patched into',
  min: 0,
  max: ALL_LINES,
  step: 1,
  unit: '',
  reads: linesText,
  help: `The machines and the mic ${stage} runs on. Their lines are summed into it and its return goes back before the mix bus; master runs it on the whole mix. bender.route({ ${stage}: ['Clatter', 'Plinky'] }) or bender.set({ ${key}: 'Clatter+Plinky' })`,
})

export const withJack = (g: Group): Group => {
  const into = intoOf(g.name)
  return into ? { ...g, sliders: [...g.sliders, jackSlider(into, g.name)] } : g
}

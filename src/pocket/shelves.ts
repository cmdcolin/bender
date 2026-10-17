import { DEFAULT_CONTROLS, type ControlKey } from '../controls.ts'
import { PRESETS, type PresetDef } from '../ui/presets/index.ts'

export interface Shelf {
  name: string
  presets: PresetDef[]
}

const LEADS: [ControlKey, string][] = [
  ['chipLevel', 'toy'],
  ['drumLevel', 'drums'],
  ['fmLevel', 'synth'],
  ['monoLevel', 'synth'],
  ['oscLevel', 'synth'],
  ['subLevel', 'synth'],
  ['humLevel', 'synth'],
  ['pcmLevel', 'keys'],
  ['sampleLevel', 'keys'],
]

const SHELF_ORDER = ['toy', 'drums', 'synth', 'keys']

/** The machine a preset turns up loudest, among the levels it names. */
export function leadOf(p: PresetDef): string {
  let lead = 'toy'
  let loudest = -1
  for (const [key, shelf] of LEADS) {
    if (!(key in p.patch)) continue
    const level = p.patch[key] ?? DEFAULT_CONTROLS[key]
    if (level > loudest) {
      loudest = level
      lead = shelf
    }
  }
  return lead
}

export const SHELVES: Shelf[] = SHELF_ORDER.map(name => ({
  name,
  presets: PRESETS.filter(p => leadOf(p) === name),
}))

export const shelfOf = (presetName: string): Shelf =>
  SHELVES.find(s => s.presets.some(p => p.name === presetName)) ?? SHELVES[0]!

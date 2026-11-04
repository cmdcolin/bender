// What an unnamed board on the home is called: the preset it is, or the one it
// was bent from — whichever preset leaves the fewest controls different.

import { CONTROL_KEYS, DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { applyPreset } from '../ui/presets/apply.ts'
import { PRESETS } from '../ui/presets/table.ts'
import { boardFromUrl } from '../ui/share.ts'

const differing = (a: Controls, b: Controls) =>
  CONTROL_KEYS.filter(k => a[k] !== b[k]).length

export function boardLabel(query: string) {
  const board = { ...DEFAULT_CONTROLS, ...boardFromUrl('', `#${query}`) }
  const nearest = PRESETS.map(preset => ({
    preset: preset.name,
    off: differing(applyPreset(preset, board), board),
  })).reduce((best, next) => (next.off < best.off ? next : best), {
    preset: '',
    off: differing(DEFAULT_CONTROLS, board),
  })
  const from = nearest.preset === '' ? 'stock' : nearest.preset
  return {
    preset: nearest.preset,
    text: nearest.off === 0 ? from : `bent from ${from}`,
  }
}

import { DEFAULT_CONTROLS, sameControls, type Controls } from '../../controls'
import { Glide } from '../../engine/glide'
import { PRESETS, type PresetDef } from './table'
import { keepYours } from './yours'

export function applyPreset(preset: PresetDef, current: Controls): Controls {
  return keepYours(
    { ...DEFAULT_CONTROLS, ...preset.patch },
    current,
    preset.patch,
  )
}

// The road from the board you are on to the one a preset names. Clicking the
// chip flies it on the clock; dragging the chip is the same road under your
// finger, one pointer step at a time, so the far end of the drag is exactly what
// the click gives you and everywhere short of it is a board neither the preset
// nor you would have written down.
//
// The same Glide the morph travels, deliberately: modes cut at the midpoint and
// your levels and contacts are held, so a half-dragged preset is a board that
// can actually be played rather than half a distortion circuit.
export function presetPath(preset: PresetDef, from: Controls): Glide {
  return new Glide(from, applyPreset(preset, from))
}

// Which preset the board on screen is, if it is one. What a save offers as a
// name: land on "wrong song", press save, and that is what it is called.
// Nothing calls this per frame — working it out is a pass over the catalog.
export function presetNameFor(current: Controls): string | undefined {
  return PRESETS.find(p => sameControls(applyPreset(p, current), current))?.name
}

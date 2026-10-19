import { DEFAULT_CONTROLS, isControlKey } from '../controls.ts'
import { OWNER_BY_KEY } from './controls/index.ts'

import type { PresetDef } from './presets/index.ts'

const haystacks = new WeakMap<PresetDef, string>()

/** The stages a preset moves off stock, so "tape delay" or "fm" finds it. */
export function presetStages(def: PresetDef): Set<string> {
  const stages = new Set<string>()
  for (const [key, value] of Object.entries(def.patch)) {
    if (!isControlKey(key)) continue
    const owner = OWNER_BY_KEY.get(key)
    if (owner && value !== DEFAULT_CONTROLS[key]) stages.add(owner)
  }
  return stages
}

function haystack(def: PresetDef) {
  let hay = haystacks.get(def)
  if (hay === undefined) {
    hay = [def.name, def.blurb, ...presetStages(def)].join(' ').toLowerCase()
    haystacks.set(def, hay)
  }
  return hay
}

/** Every word of the query appears in the preset's name, blurb or stages. */
export function presetMatches(def: PresetDef, query: string) {
  const hay = haystack(def)
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(word => hay.includes(word))
}

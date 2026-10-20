import { formerName } from './stageNames.ts'

import type { ControlKey } from '../controls.ts'
import type { Group } from './controls/types.ts'

export interface SettingHit {
  key: ControlKey
  label: string
  stage: string
}

const words = (query: string) =>
  query.toLowerCase().split(/\s+/).filter(Boolean)

export function findSettings(
  groups: readonly Group[],
  query: string,
): SettingHit[] {
  const want = words(query)
  if (want.length === 0) return []
  const hits = groups.flatMap(g =>
    g.sliders
      .filter(def => {
        const hay = [def.label, def.lane, def.part, g.name, formerName(g.name)]
          .join(' ')
          .toLowerCase()
        return want.every(w => hay.includes(w))
      })
      .map(def => ({ key: def.key, label: def.label, stage: g.name })),
  )
  const named = (h: SettingHit) =>
    want.some(w => h.label.toLowerCase().startsWith(w)) ? 0 : 1
  return hits.toSorted((a, b) => named(a) - named(b))
}

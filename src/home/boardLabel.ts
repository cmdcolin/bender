// The preset an unnamed board is, if it is one: the same name the app's save
// offers for it.

import { DEFAULT_CONTROLS } from '../controls.ts'
import { presetNameFor } from '../ui/presets/apply.ts'
import { boardFromUrl } from '../ui/share.ts'

export const presetOf = (query: string) =>
  presetNameFor({ ...DEFAULT_CONTROLS, ...boardFromUrl('', `#${query}`) })

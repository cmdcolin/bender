import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'

import type { SliderDef } from './controls/index.ts'

export const rowShown = (def: SliderDef, c: Controls): boolean =>
  !def.needs || def.needs(c) || c[def.key] !== DEFAULT_CONTROLS[def.key]

// The looks the board ships with, and the rolls that go looking for the ones it
// doesn't: the table in table.ts, and a file per thing a roll is about.
export { PRESETS, type PresetDef } from './table'
export { applyPreset, presetPath } from './apply'
export { mutate, randomLook, resetGroup, rollGroup, rollKeys } from './roll'
export { huntCandidates, SCENARIOS, type ScenarioDef } from './scenarios'
export {
  applyCut,
  CUTS,
  cutOff,
  cutSays,
  cutsFor,
  cutStands,
  cutWired,
  partKeys,
  type CutDef,
} from './cuts'

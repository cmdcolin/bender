// The looks the board ships with, and the rolls that go looking for the ones it
// doesn't: the table in table.ts, and a file per thing a roll is about.
export { PRESETS, type PresetDef } from './table.ts'
export { applyPreset, presetNameFor, presetPath } from './apply.ts'
export {
  mutate,
  randomLook,
  resetGroup,
  resetKeys,
  rollGroup,
  rollKeys,
} from './roll.ts'
export { applyRig, RIGS, rigsFor, rigStands, type RigDef } from './rigs.ts'
export {
  huntCandidates,
  SCENARIOS,
  tailCandidates,
  type ScenarioDef,
} from './scenarios.ts'
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
} from './cuts.ts'

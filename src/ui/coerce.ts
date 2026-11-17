import { asKitSetting, asLen, asMask, LEN_KEYS } from '../drums.ts'
import {
  asLaneLen,
  asLaneValue,
  LANE_LEN_SET,
  LANE_VALUE_KEYS,
} from '../lanes.ts'
import { asPhraseCode, PHRASE_KEY_SET } from '../prattle.ts'
import {
  asTuneLen,
  asTuneStep,
  LEAD_SEQ_STEP_KEYS,
  MONO_SEQ_STEP_KEYS,
  TUNE_ALL_STEP_KEYS,
} from '../tune.ts'
import { EDITOR_KEYS, sliderFor, snapToStep } from './controls/index.ts'

import type { ControlKey } from '../controls.ts'

const TUNE_KEYS = new Set<ControlKey>([
  ...TUNE_ALL_STEP_KEYS,
  ...MONO_SEQ_STEP_KEYS,
  ...LEAD_SEQ_STEP_KEYS,
])

// The controls a widget turns have no slider to snap to, and they are not all
// the same shape: a pattern is sixteen bits or nothing, a row's length is a
// whole number of steps it can play, and a step of the memory is a note, a rest
// or a hold.
export function coerceControl(key: ControlKey, v: number): number {
  return LEN_KEYS.has(key)
    ? asLen(v)
    : TUNE_KEYS.has(key)
      ? asTuneStep(v)
      : key === 'tuneLen' || key === 'monoSeqLen' || key === 'leadSeqLen'
        ? asTuneLen(v)
        : LANE_VALUE_KEYS.has(key)
          ? asLaneValue(v)
          : (asKitSetting(key, v) ??
            (LANE_LEN_SET.has(key)
              ? asLaneLen(v)
              : PHRASE_KEY_SET.has(key)
                ? asPhraseCode(v)
                : EDITOR_KEYS.has(key)
                  ? asMask(v)
                  : snapToStep(sliderFor(key), v)))
}

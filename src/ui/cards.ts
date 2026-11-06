import { engine } from '../engine/engine.ts'
import { cardKey, type CardSuffix } from '../monoCard.ts'
import {
  LEAD_SEQ_ACCENT_KEYS,
  LEAD_SEQ_SLIDE_KEYS,
  LEAD_SEQ_STEP_KEYS,
  MONO_SEQ_ACCENT_KEYS,
  MONO_SEQ_SLIDE_KEYS,
  MONO_SEQ_STEP_KEYS,
} from '../tune.ts'

/** The two builds of the voice card, and what tells their panels apart. */
export const CARDS = {
  Growler: {
    prefix: 'mono',
    label: 'growler',
    dest: 'mono',
    steps: MONO_SEQ_STEP_KEYS,
    accents: MONO_SEQ_ACCENT_KEYS,
    slides: MONO_SEQ_SLIDE_KEYS,
    pos: 'monoSeqPos',
    ram: 'monoSeqRam',
    flags: 'monoSeqFlags',
    damage: 'monoSeqDamage',
    recording: engine.seqRecord,
    arm: (on: boolean) => engine.armSeqRecord(on),
  },
  Howler: {
    prefix: 'lead',
    label: 'howler',
    dest: 'lead',
    steps: LEAD_SEQ_STEP_KEYS,
    accents: LEAD_SEQ_ACCENT_KEYS,
    slides: LEAD_SEQ_SLIDE_KEYS,
    pos: 'leadSeqPos',
    ram: 'leadSeqRam',
    flags: 'leadSeqFlags',
    damage: 'leadSeqDamage',
    recording: engine.leadRecord,
    arm: (on: boolean) => engine.armLeadRecord(on),
  },
} as const

export type CardStage = keyof typeof CARDS

export const keyOf = <S extends CardSuffix>(stage: CardStage, suffix: S) =>
  cardKey(CARDS[stage].prefix, suffix)

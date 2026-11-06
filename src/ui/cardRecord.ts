import { engine } from '../engine/engine.ts'

import type { CardStage } from './cards.ts'

export const CARD_RECORD = {
  Growler: {
    recording: engine.seqRecord,
    arm: (on: boolean) => engine.armSeqRecord(on),
  },
  Howler: {
    recording: engine.leadRecord,
    arm: (on: boolean) => engine.armLeadRecord(on),
  },
} satisfies Record<CardStage, unknown>

import { MIC } from '../dsp/micJacks.ts'
import { DELAY_ON_FIRST, DELAY_ON_SECOND } from '../dsp/micLine.ts'
import { MACHINES, type Machine, type MachineJack } from '../machines.ts'

import type { Controls } from '../controls.ts'

export interface MicJack {
  /** the micPatch choice, and the jack's label in the patch drawing */
  name: string
  /** the stage the jack sits on, or 'mix' */
  stage: string
  /** what the jack is on that stage */
  part: string
  /** what a voice does there */
  says: string
}

interface StageJacks {
  stage: string
  kind?: string
  jacks: readonly MachineJack[]
}

// The jacks on stages that are not machines, the mix bus last.
const OTHER_STAGES: readonly StageJacks[] = [
  {
    stage: 'Wraith',
    kind: 'tape delay',
    jacks: [
      {
        jack: 'delayFb',
        name: 'delay fb',
        part: 'feedback path',
        says: 'your voice goes round with the repeats and builds up',
      },
    ],
  },
  {
    stage: 'Ring mod',
    jacks: [
      {
        jack: 'ringCarrier',
        name: 'ring car',
        part: 'carrier',
        says: 'your voice multiplies everything going through',
      },
    ],
  },
  {
    stage: 'Crusher',
    jacks: [
      {
        jack: 'crushClock',
        name: 'crush clock',
        part: 'clock pin',
        says: 'each cycle of your voice takes one sample, so you sing the sample rate and silence freezes it',
      },
    ],
  },
  {
    stage: 'Clipper',
    jacks: [
      {
        jack: 'clipBypass',
        name: 'clip bypass',
        part: 'bypass pin',
        says: 'your voice rides the amp’s supply straight into its input, and with the gain cap in it comes out two hundred times louder',
      },
    ],
  },
  {
    stage: 'Glitch buffer',
    jacks: [
      {
        jack: 'glitchTrig',
        name: 'glitch trig',
        part: 'trigger line',
        says: 'a clap fires a glitch',
      },
    ],
  },
  {
    stage: 'mix',
    jacks: [
      {
        jack: 'mix',
        name: 'mix',
        part: 'mix bus',
        says: 'your voice plays through like any other source',
      },
    ],
  },
]

const benchRank = (m: Machine) => (m.map !== 'line' ? 0 : 'face' in m ? 1 : 2)

// The machines with a jack in bench order: the board's, then the other faces on
// the bench, then the rest. Then the other stages.
const STAGES: readonly StageJacks[] = [
  ...MACHINES.flatMap(m =>
    'mic' in m
      ? [{ stage: m.name, kind: m.kind, jacks: m.mic, rank: benchRank(m) }]
      : [],
  )
    .toSorted((a, b) => a.rank - b.rank)
    .map(({ stage, kind, jacks }) => ({ stage, kind, jacks })),
  ...OTHER_STAGES,
]

export const MIC_JACKS: readonly MicJack[] = STAGES.flatMap(
  ({ stage, jacks }) =>
    jacks.map(({ jack, name, part, says }) => ({
      at: MIC[jack],
      jack: { name, stage, part, says },
    })),
)
  .toSorted((a, b) => a.at - b.at)
  .map(j => j.jack)

/** A jack in one line: "Plinky’s clock pin: the pitch…". */
export const describeJack = (i: number) => {
  const { stage, part, says } = MIC_JACKS[i]!
  return `${stage === 'mix' ? 'The mix bus' : `${stage}’s ${part}`}: ${says}`
}

// Each stage with a jack, each with its jacks in the order its menu lists
// them, the wildest first.
export const JACKS_BY_STAGE: readonly {
  stage: string
  kind?: string
  jacks: number[]
}[] = STAGES.map(({ stage, kind, jacks }) => ({
  stage,
  ...(kind !== undefined && { kind }),
  jacks: jacks.map(j => MIC[j.jack]),
}))

/** The micPatch values of the jacks on a stage, in menu order. */
export const jacksOn = (stage: string): number[] =>
  JACKS_BY_STAGE.find(s => s.stage === stage)?.jacks ?? []

/** The jacks the mic wires are on: the first wire's, then the second's when
    it is plugged in somewhere. */
export const wiredJacks = (c: Controls): number[] => {
  const first = Math.round(c.micPatch)
  const second = Math.round(c.micPatch2) - 1
  return second < 0 || second === first ? [first] : [first, second]
}

/** Which wire is on a jack: 1, 2, or 0 for neither. */
export const wireOn = (c: Controls, jack: number) =>
  Math.round(c.micPatch) === jack
    ? 1
    : Math.round(c.micPatch2) - 1 === jack
      ? 2
      : 0

/** Whether a wire runs through the delay: it is up and sits on that wire. */
export const wireIsLate = (c: Controls, wire: 1 | 2) => {
  const on = Math.round(c.micDelayOn)
  return (
    c.micDelay > 0 && on !== (wire === 1 ? DELAY_ON_SECOND : DELAY_ON_FIRST)
  )
}

/** A wire's name on the map: what reaches the jack along it. */
export const wireLabel = (c: Controls, wire: 1 | 2) =>
  !wireIsLate(c, wire)
    ? 'mic'
    : c.micFreeze >= 0.5
      ? 'frozen mic'
      : 'delayed mic'

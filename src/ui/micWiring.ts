import { MIC } from '../dsp/micJacks.ts'

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

const JACKS: Record<(typeof MIC)[keyof typeof MIC], MicJack> = {
  [MIC.mix]: {
    name: 'mix',
    stage: 'mix',
    part: 'mix bus',
    says: 'your voice plays through like any other source',
  },
  [MIC.toyRail]: {
    name: 'chip rail',
    stage: 'Plinky',
    part: 'supply rail',
    says: 'yelling browns the toy out',
  },
  [MIC.oscFm]: {
    name: 'osc FM',
    stage: 'Chaos osc',
    part: 'FM input',
    says: 'your voice bends oscillator A’s pitch',
  },
  [MIC.delayFb]: {
    name: 'delay fb',
    stage: 'Wraith',
    part: 'feedback path',
    says: 'your voice goes round with the repeats and builds up',
  },
  [MIC.ringCarrier]: {
    name: 'ring car',
    stage: 'Ring mod',
    part: 'carrier',
    says: 'your voice multiplies everything going through',
  },
  [MIC.drumTrig]: {
    name: 'drum trig',
    stage: 'Clatter',
    part: 'trigger line',
    says: 'a clap fires the kit',
  },
  [MIC.glitchTrig]: {
    name: 'glitch trig',
    stage: 'Glitch buffer',
    part: 'trigger line',
    says: 'a clap fires a glitch',
  },
  [MIC.toyClock]: {
    name: 'toy clock',
    stage: 'Plinky',
    part: 'clock pin',
    says: 'the pitch of your voice sets the tempo and tuning, and silence slows the toy to clicks',
  },
  [MIC.toyAddr]: {
    name: 'toy addr',
    stage: 'Plinky',
    part: 'address bus',
    says: 'louder sounds jump further through the song',
  },
  [MIC.toyData]: {
    name: 'toy data',
    stage: 'Plinky',
    part: 'data bus',
    says: 'talking shifts the notes and yelling scrambles them',
  },
  [MIC.oscSync]: {
    name: 'osc sync',
    stage: 'Chaos osc',
    part: 'sync input',
    says: 'each cycle of your voice restarts oscillator A, so it follows your pitch',
  },
  [MIC.tapeMotor]: {
    name: 'tape motor',
    stage: 'Spool',
    part: 'capstan motor',
    says: 'the tape runs as fast as you are loud and stops in silence',
  },
  [MIC.growlerIn]: {
    name: 'Growler in',
    stage: 'Growler',
    part: 'external input',
    says: 'hold a key and the filter and envelope open on your voice',
  },
  [MIC.glintBus]: {
    name: 'Glint bus',
    stage: 'Glint',
    part: 'data bus',
    says: 'your voice overwrites its settings, and they stay overwritten',
  },
  [MIC.crushClock]: {
    name: 'crush clock',
    stage: 'Crusher',
    part: 'clock pin',
    says: 'each cycle of your voice takes one sample, so you sing the sample rate and silence freezes it',
  },
}

export const MIC_JACKS: readonly MicJack[] = Object.values(MIC)
  .toSorted((a, b) => a - b)
  .map(i => JACKS[i])

/** A jack in one line: "Plinky’s clock pin: the pitch…". */
export const describeJack = (i: number) => {
  const { stage, part, says } = MIC_JACKS[i]!
  return `${stage === 'mix' ? 'The mix bus' : `${stage}’s ${part}`}: ${says}`
}

// The machines with a jack, in bench order, each with its jacks in the order
// its menu lists them, the wildest first.
export const JACKS_BY_STAGE: readonly {
  stage: string
  kind?: string
  jacks: number[]
}[] = [
  {
    stage: 'Plinky',
    kind: 'toy keyboard',
    jacks: [MIC.toyClock, MIC.toyAddr, MIC.toyData, MIC.toyRail],
  },
  { stage: 'Clatter', kind: 'toy drums', jacks: [MIC.drumTrig] },
  { stage: 'Glint', kind: 'FM synth', jacks: [MIC.glintBus] },
  { stage: 'Growler', kind: 'mono synth', jacks: [MIC.growlerIn] },
  { stage: 'Spool', kind: 'tape loop', jacks: [MIC.tapeMotor] },
  { stage: 'Chaos osc', kind: 'oscillator', jacks: [MIC.oscSync, MIC.oscFm] },
  { stage: 'Wraith', kind: 'tape delay', jacks: [MIC.delayFb] },
  { stage: 'Ring mod', jacks: [MIC.ringCarrier] },
  { stage: 'Crusher', jacks: [MIC.crushClock] },
  { stage: 'Glitch buffer', jacks: [MIC.glitchTrig] },
  { stage: 'mix', jacks: [MIC.mix] },
]

/** The micPatch values of the jacks on a stage, in menu order. */
export const jacksOn = (stage: string): number[] =>
  JACKS_BY_STAGE.find(s => s.stage === stage)?.jacks ?? []

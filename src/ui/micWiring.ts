import { MIC } from '../dsp/micJacks.ts'

export interface MicJack {
  /** the jack's label, and the micPatch choice */
  name: string
  /** the stage the jack sits on, or 'mix' */
  stage: string
  says: string
}

const JACKS: Record<(typeof MIC)[keyof typeof MIC], MicJack> = {
  [MIC.mix]: { name: 'mix', stage: 'mix', says: 'the mix bus' },
  [MIC.toyRail]: {
    name: 'chip rail',
    stage: 'Plinky',
    says: 'the toy supply rail: yelling browns the toy out',
  },
  [MIC.oscFm]: {
    name: 'osc FM',
    stage: 'Chaos osc',
    says: 'oscillator A’s FM input',
  },
  [MIC.delayFb]: {
    name: 'delay fb',
    stage: 'Wraith',
    says: 'the delay feedback path',
  },
  [MIC.ringCarrier]: {
    name: 'ring car',
    stage: 'Ring mod',
    says: 'the ring mod carrier',
  },
  [MIC.drumTrig]: {
    name: 'drum trig',
    stage: 'Clatter',
    says: 'the drum machine’s trigger line: a clap fires the kit',
  },
  [MIC.glitchTrig]: {
    name: 'glitch trig',
    stage: 'Glitch buffer',
    says: 'the glitch buffer’s trigger line: a clap fires it',
  },
  [MIC.toyClock]: {
    name: 'toy clock',
    stage: 'Plinky',
    says: 'Plinky’s clock pin: the pitch of your voice sets the tempo and tuning, and silence slows it to clicks',
  },
  [MIC.toyAddr]: {
    name: 'toy addr',
    stage: 'Plinky',
    says: 'Plinky’s address bus: louder sounds jump further through the song',
  },
  [MIC.toyData]: {
    name: 'toy data',
    stage: 'Plinky',
    says: 'Plinky’s data bus: talking shifts the notes and yelling scrambles them',
  },
  [MIC.oscSync]: {
    name: 'osc sync',
    stage: 'Chaos osc',
    says: 'oscillator A’s sync input: each cycle of your voice restarts it, so it follows your pitch',
  },
  [MIC.tapeMotor]: {
    name: 'tape motor',
    stage: 'Spool',
    says: 'Spool’s capstan motor: the tape runs as fast as you are loud and stops in silence',
  },
  [MIC.growlerIn]: {
    name: 'Growler in',
    stage: 'Growler',
    says: 'Growler’s external input: the keys open the filter and envelope on your voice',
  },
  [MIC.glintBus]: {
    name: 'Glint bus',
    stage: 'Glint',
    says: 'Glint’s data bus: your voice overwrites its registers, and the damage stays',
  },
}

export const MIC_JACKS: readonly MicJack[] = Object.values(MIC)
  .toSorted((a, b) => a - b)
  .map(i => JACKS[i])

/** The micPatch values of the jacks on a stage, in order. */
export const jacksOn = (stage: string): number[] =>
  MIC_JACKS.flatMap((j, i) => (j.stage === stage ? [i] : []))

/** Every stage with a jack, in the order the bench lists them. */
export const BY_STAGE = [
  'mix',
  'Plinky',
  'Clatter',
  'Glint',
  'Growler',
  'Spool',
  'Chaos osc',
  'Wraith',
  'Ring mod',
  'Glitch buffer',
]

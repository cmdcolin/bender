import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { choiceValue, groupKeys } from '../controls'

// A whole stage set up, where a cut is three controls under one heading. Some
// machines only say anything with every knob on the panel pointing the same
// way: the feedback desk is sixteen controls of which any one alone does
// nothing audible, and the settings worth hearing are particular combinations
// of a send, a delay time, a destination and how hard the return amps are being
// asked to run. Press one and the rows underneath say what it was, which is the
// same bargain the cuts make — a way in that leaves the settings on screen.
export interface RigDef {
  group: string
  name: string
  blurb: string
  patch: Partial<Controls>
}

// A rig may reach outside its own stage, and two of these have to: a return
// soldered to the oscillator's FM pin or to the toy's supply is a wire to a
// machine that boots silent, and a rig you cannot hear teaches nothing. Only
// the stage's own controls go back to stock when one lands, so what a rig
// brings up elsewhere stays yours to turn down.
export const RIGS: RigDef[] = [
  {
    group: 'Feedback bus',
    name: 'one squeal',
    blurb:
      'The whole of the no-input mixer in four controls — one send round a short cord, tilted bright, into amps that saturate rather than square off',
    patch: {
      fbAmt: 0.5,
      fbDelayMs: 1.7,
      fbTone: 0.3,
      fbRails: 0.35,
    },
  },
  {
    group: 'Feedback bus',
    name: 'slow throb',
    blurb:
      'Two strips a few tenths of a millisecond apart, which is close enough to fight over the same note and far enough that neither wins — the beat is the difference between the two cords',
    patch: {
      fbAmt: 0.4,
      fbDelayMs: 3.4,
      fbTone: 0.25,
      fb2Amt: 0.37,
      fb2Ms: 3.9,
      fb2Tone: -0.2,
      fbRails: 0.45,
    },
  },
  {
    group: 'Feedback bus',
    name: 'never settles',
    blurb:
      'Three cords of no common length wired into a ring, each recirculating its neighbour — a squeal, a flutter and an echo with no mode any of them can hold, wandering untouched',
    patch: {
      fbAmt: 0.32,
      fbDelayMs: 2.6,
      fbTone: 0.35,
      fb2Amt: 0.29,
      fb2Ms: 37,
      fb2Tone: 0,
      fb3Amt: 0.26,
      fb3Ms: 121,
      fb3Tone: -0.35,
      fbCross: 0.9,
      fbRails: 0.5,
      fbSag: 0.35,
    },
  },
  {
    group: 'Feedback bus',
    name: 'motorboat',
    blurb:
      'A dried-out coupling cap on the return: the loop climbs, walks its own bias to cutoff, dies, drains and does it again — a rhythm out of a desk with no clock on it',
    patch: {
      fbAmt: 1.2,
      fbDelayMs: 9,
      fbTone: -0.2,
      fbRails: 0.6,
      fbBlock: 0.75,
    },
  },
  {
    group: 'Feedback bus',
    name: 'buzzsaw octave',
    blurb:
      'One loud strip into hard rails set well apart — the wave squares off on one half before the other, so what comes back is an octave under the squeal and a pile of dc',
    patch: {
      fbAmt: 0.55,
      fbDelayMs: 2.4,
      fbTone: 0.15,
      fbRails: 1,
      fbAsym: 0.6,
    },
  },
  {
    group: 'Feedback bus',
    name: 'hash',
    blurb:
      'Three squeals a hair apart through amps too slow to draw any of them — what a slew limiter does to a sum is not what it does to either part, and none of it has harmonics',
    patch: {
      fbAmt: 0.32,
      fbDelayMs: 1.9,
      fbTone: 0.4,
      fb2Amt: 0.29,
      fb2Ms: 2.3,
      fb2Tone: 0.15,
      fb3Amt: 0.27,
      fb3Ms: 2.9,
      fb3Tone: -0.1,
      fbCross: 0.4,
      fbRails: 0.8,
      fbSlew: 0.7,
      fbAsym: -0.3,
    },
  },
  {
    group: 'Feedback bus',
    name: 'browns out the toy',
    blurb:
      'The return soldered to the supply rail the toy runs on — the louder the desk screams the less there is to make the tune out of, and the tune is what is feeding it',
    patch: {
      chipLevel: 0.85,
      fbAmt: 1.1,
      fbDelayMs: 60,
      fbTone: -0.3,
      fbDest: choiceValue('fbDest', 'chip rail'),
      fbRails: 0.5,
      fbSag: 0.8,
    },
  },
  {
    group: 'Feedback bus',
    name: 'the loop picks the note',
    blurb:
      'The return on oscillator A’s FM pin, on a cord long enough to hear go round — the loop is no longer a squeal at a pitch, it is what sets the pitch',
    patch: {
      oscLevel: 0.7,
      fbAmt: 0.55,
      fbDelayMs: 140,
      fbTone: -0.4,
      fbDest: choiceValue('fbDest', 'osc FM'),
      fbRails: 0.4,
      fbSag: 0.3,
    },
  },
]

export const rigsFor = (group: string): RigDef[] =>
  RIGS.filter(r => r.group === group)

// The stage back where it booted and the rig written over it, so pressing a
// second rig is that rig rather than whatever the first one left standing.
// Anything the rig reaches for outside the stage is left where it lands.
export function applyRig(rig: RigDef, current: Controls): Controls {
  const next = { ...current }
  for (const key of groupKeys(rig.group)) next[key] = DEFAULT_CONTROLS[key]
  return { ...next, ...rig.patch }
}

/** Whether the stage is sitting exactly where this rig puts it. What the rig
    reaches for elsewhere doesn't count: bringing the toy's fader back down
    leaves the desk still wired the way the rig wired it. */
export const rigStands = (rig: RigDef, c: Controls): boolean =>
  groupKeys(rig.group).every(
    key => c[key] === (rig.patch[key] ?? DEFAULT_CONTROLS[key]),
  )

import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls'
import { choiceValue, groupKeys, sliderFor } from '../controls'

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
const EMPTY = '\u2014'

/** A bend by the short name the slot wears, off the slots' own choice list. */
const slot = (label: string) => choiceValue('bendSlot0', label)

// The settings the ordering rigs are demonstrated with, shared by both halves
// of each pair, because the pair is only worth pressing twice if the one thing
// that differs between them is which stage came first.
const CRUSH = { bits: 5, srHz: 6000, crushMix: 1 }
const FILTER = { filtHz: 900, filtRes: 1.05, filtDriveDb: 6, filtMix: 1 }
const FUZZ = {
  distMode: choiceValue('distMode', 'fuzz'),
  driveDb: 30,
  distToneHz: 6000,
  distMix: 1,
}
const COMB = { combHz: 220, combFb: 0.95, combDampHz: 5000, combMix: 0.8 }
const GLITCH = {
  glitchProb: 0.8,
  glitchSliceMs: 90,
  glitchRepeat: 4,
  glitchRevProb: 0.4,
  glitchMix: 1,
}

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
  {
    group: 'Slot order',
    name: 'crush, then filter',
    blurb:
      'A five-bit decimator with the filter after it — everything the crusher folded down comes back through 900 Hz, so the aliasing is inside the growl rather than on top of it',
    patch: {
      bendSlot0: slot('crush'),
      bendSlot1: slot('filt'),
      bendSlot2: slot(EMPTY),
      bendSlot3: slot(EMPTY),
      bendSlot4: slot(EMPTY),
      bendSlot5: slot(EMPTY),
      ...CRUSH,
      ...FILTER,
    },
  },
  {
    group: 'Slot order',
    name: 'filter, then crush',
    blurb:
      'The same two stages the other way round: the filter picks a band and the crusher folds *that* down, so the aliases land above the filter and nothing takes them off again — the pair to hear against the one before it',
    patch: {
      bendSlot0: slot('filt'),
      bendSlot1: slot('crush'),
      bendSlot2: slot(EMPTY),
      bendSlot3: slot(EMPTY),
      bendSlot4: slot(EMPTY),
      bendSlot5: slot(EMPTY),
      ...CRUSH,
      ...FILTER,
    },
  },
  {
    group: 'Slot order',
    name: 'fuzz into the comb',
    blurb:
      'Fuzz first, so the comb is given a wave that is already square and rings on its harmonics — a tuned string plucked by a distortion pedal',
    patch: {
      bendSlot0: slot('dist'),
      bendSlot1: slot('comb'),
      bendSlot2: slot(EMPTY),
      bendSlot3: slot(EMPTY),
      bendSlot4: slot(EMPTY),
      bendSlot5: slot(EMPTY),
      ...FUZZ,
      ...COMB,
    },
  },
  {
    group: 'Slot order',
    name: 'comb into the fuzz',
    blurb:
      'The comb first, so what reaches the fuzz is a handful of loud resonant peaks — they intermodulate against each other in the clipper and come out as a chord nothing played',
    patch: {
      bendSlot0: slot('comb'),
      bendSlot1: slot('dist'),
      bendSlot2: slot(EMPTY),
      bendSlot3: slot(EMPTY),
      bendSlot4: slot(EMPTY),
      bendSlot5: slot(EMPTY),
      ...FUZZ,
      ...COMB,
    },
  },
  {
    group: 'Slot order',
    name: 'chopped, then rung',
    blurb:
      'The stutter ahead of the comb, so every repeat arrives at the string as a fresh pluck and the ring restarts with it',
    patch: {
      bendSlot0: slot('glitch'),
      bendSlot1: slot('comb'),
      bendSlot2: slot(EMPTY),
      bendSlot3: slot(EMPTY),
      bendSlot4: slot(EMPTY),
      bendSlot5: slot(EMPTY),
      ...GLITCH,
      ...COMB,
    },
  },
  {
    group: 'Slot order',
    name: 'rung, then chopped',
    blurb:
      'The stutter after the comb, so what gets sliced and played backwards is the ring itself — the same two stages, and the repeats now cut across the decay instead of starting it',
    patch: {
      bendSlot0: slot('comb'),
      bendSlot1: slot('glitch'),
      bendSlot2: slot(EMPTY),
      bendSlot3: slot(EMPTY),
      bendSlot4: slot(EMPTY),
      bendSlot5: slot(EMPTY),
      ...GLITCH,
      ...COMB,
    },
  },
]

export const rigsFor = (group: string): RigDef[] =>
  RIGS.filter(r => r.group === group)

// What a rig puts back before it writes: its own stage, and whatever the rest of
// the row reaches for outside it, so pressing a second rig is that rig rather
// than that rig plus what the first one left lying about — a chain named
// *filter, then crush* with the previous chain's comb still wet is not the thing
// it says it is.
//
// A level is the exception. Bringing a machine up is how a rig soldered to a
// chip that boots silent gets heard at all, and turning a machine off again is
// not the row's to do: it is the one control on the board that is only ever
// about whether you can hear something.
const CLEARS = new Map<string, ControlKey[]>()

function clears(group: string): ControlKey[] {
  let keys = CLEARS.get(group)
  if (!keys) {
    const set = new Set<ControlKey>(groupKeys(group))
    for (const rig of rigsFor(group))
      for (const key of Object.keys(rig.patch) as ControlKey[])
        if (sliderFor(key).role !== 'level') set.add(key)
    keys = [...set]
    CLEARS.set(group, keys)
  }
  return keys
}

export function applyRig(rig: RigDef, current: Controls): Controls {
  const next = { ...current }
  for (const key of clears(rig.group)) next[key] = DEFAULT_CONTROLS[key]
  return { ...next, ...rig.patch }
}

/** Whether the board is sitting exactly where this rig puts it — over the same
    controls the rig would clear, so a machine you have since turned down still
    leaves the rig standing and a mix you have moved does not. */
export const rigStands = (rig: RigDef, c: Controls): boolean =>
  clears(rig.group).every(
    key => c[key] === (rig.patch[key] ?? DEFAULT_CONTROLS[key]),
  )

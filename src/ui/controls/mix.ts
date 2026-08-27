import type { ControlKey } from '../../controls'
import { SOURCE_TAPS, TAP_MIC, type SourceTap } from '../../engine/params'
import type { Group } from './types'

// Where the six of them meet.
//
// Every source has a fader and every fader was on its own machine's panel, one
// press and a scroll away from the next — so the one question a mix is actually
// about, how loud these are against each other, was the one question the panel
// could not be asked. Worse for the FM chip than for any of them: it boots at
// zero, it has no keyboard of its own, and its fader is the top row of the
// longest panel on the board. "It is buried in the mix" and "I have never found
// its level" are the same sentence about that.
//
// So the mix bus, which the map has always drawn as a box, opens like any other
// stage — every fader on one screen, a meter beside each saying what is actually
// coming off it, and one knob of the desk's own.

// One strip of the desk: the fader, the machine it belongs to — which is the
// name the map draws it under, not the word the fader carries on its own panel,
// where six rows all reading *Level* would be a mixer nobody can use — and which
// tap on the bus reads it back.
//
// The first six are in the order the chain sums them, taken off the same list
// the audio thread lays its taps out in; the mic is the seventh because it is a
// wire rather than a channel, and only one of its seven settings reaches the
// bus at all.
export interface Channel {
  key: ControlKey
  name: string
  tap: number
  /** Drawn on the desk but not the desk's to move. Your monitoring level and
      the file you dropped are yours over any gesture — see YOURS — so the count,
      the reset and the dice all leave them exactly where you put them. */
  yours?: true
}

const sourceTap = (label: SourceTap) => SOURCE_TAPS.indexOf(label)

export const CHANNELS: readonly Channel[] = [
  { key: 'chipLevel', name: 'Toy keyboard', tap: sourceTap('toyChip') },
  { key: 'drumLevel', name: 'Toy drums', tap: sourceTap('toyDrum') },
  { key: 'fmLevel', name: 'FM chip', tap: sourceTap('fmChip') },
  { key: 'oscLevel', name: 'Chaos osc', tap: sourceTap('chaosOsc') },
  { key: 'noiseLevel', name: 'Noise & crackle', tap: sourceTap('noise') },
  {
    key: 'sampleLevel',
    name: 'Sampler',
    tap: sourceTap('sampler'),
    yours: true,
  },
  { key: 'micLevel', name: 'Mic', tap: TAP_MIC, yours: true },
]

export const MIX_GROUPS: Group[] = [
  {
    name: 'Mix bus',
    place: 'Sources',
    editor: { kind: 'mixer' },
    borrows: CHANNELS.filter(c => !c.yours).map(c => c.key),
    sliders: [
      {
        key: 'mixDrive',
        label: 'Bus drive',
        min: -12,
        max: 24,
        step: 0.5,
        unit: 'dB',
        help: 'The summing amp the six of them meet in. At unity it is a wire, so nothing happens here until you move it. Wound up it is the one saturation ahead of the bends, so the whole board arrives at them driven together — and whatever is loudest is what ducks the rest.',
      },
    ],
  },
]

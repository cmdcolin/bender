import { DEFAULT_CONTROLS } from '../controls.ts'
import { applyPreset } from '../ui/presets/apply.ts'
import { PRESETS } from '../ui/presets/table.ts'
import { sceneHash } from '../ui/share.ts'
import { boardUrl } from './paths.ts'

const SCENES = [
  {
    preset: 'melody scrambler',
    says: 'A pot soldered onto the toy keyboard’s program counter, so the song jumps around its own ROM',
  },
  {
    preset: 'two dying batteries',
    says: 'The toy keyboard and the drum machine on separate dying batteries, each browning out and rebooting on its own schedule',
  },
  {
    preset: 'bird fight',
    says: 'The FM chip’s note allocator is stuck, so the song and a bird call overwrite each other’s registers',
  },
  {
    preset: 'basement organ',
    says: 'The sample keyboard’s pipe organ plays the song in power chords, three octaves down off a slowed ROM clock',
  },
  {
    preset: 'acid techno',
    says: 'The mono synth plays a squelching line over a techno kit',
  },
  {
    preset: 'drum scream',
    says: 'The drum machine retriggers faster than audio rate, so every hit becomes a pitch',
  },
  {
    preset: 'fuzz into the stack',
    says: 'The toy through a germanium fuzz into an amp just short of breaking up',
  },
  {
    preset: 'register shuffle',
    says: 'A codec files each band under the wrong one, so the tune hops octaves',
  },
  {
    preset: 'the loop eats itself',
    says: 'The toy records onto a tape loop that comes back worse every lap',
  },
  {
    preset: 'ballroom at the end of time',
    says: 'A piano 78 off archive.org loops one phrase, and the tape wears it down a little more every lap',
  },
  {
    preset: 'numbers station on the sea floor',
    says: 'A shortwave numbers station reads its digits through a codec dropping frames, each word sliding down in pitch',
  },
  {
    preset: 'mission control after everyone left',
    says: 'NASA comms loop and skip around the tape, each echo a fourth lower than the last',
  },
  {
    preset: 'radio play in a flooded basement',
    says: 'An old radio show through a failing cassette, a spring tank and a ground hum',
  },
  {
    preset: 'the choir is one record',
    says: 'One 78 piles up on four tape loops, each copy shifted a little higher, until it is a choir',
  },
]

export const scenes = SCENES.flatMap(({ preset, says }) =>
  PRESETS.filter(p => p.name === preset).map(def => {
    const board = applyPreset(def, DEFAULT_CONTROLS)
    return {
      name: def.name,
      says,
      href: boardUrl(sceneHash(board, def.shelf)),
    }
  }),
)

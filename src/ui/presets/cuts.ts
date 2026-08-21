import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls'
import { GROUPS, sliderFor } from '../controls'
import { formatValue } from '../slider-scale'

// A knife on a bus is three controls that only mean anything together — a wire,
// what happened to it, and how far through the trace the blade went — and most
// of the combinations are a wire you can cut and hear nothing. These are the
// ones worth hearing, named for what comes out rather than for where the blade
// went, so the row is a way into the settings underneath it: press one, and the
// rows below say which three controls that was.
export interface CutDef {
  group: string
  part: string
  name: string
  blurb: string
  patch: Partial<Controls>
}

const KNIFE = 'knife on the bus'

// By name, so a bus growing a wire or a fault renames nothing here and a cut
// naming a wire that no longer exists fails loudly rather than landing on
// whatever is at that index now.
function pick(key: ControlKey, choice: string): number {
  const def = sliderFor(key)
  const at = def.choices?.indexOf(choice)
  if (at === undefined || at < 0)
    throw new Error(`${key} has no choice named '${choice}'`)
  return def.min + at
}

export const CUTS: CutDef[] = [
  {
    group: 'Toy keyboard',
    part: KNIFE,
    name: 'rests fill in',
    blurb:
      'A note wire held high — the song keeps its rhythm and its silences become notes',
    patch: {
      chipDataLine: pick('chipDataLine', 'D2'),
      chipDataFault: pick('chipDataFault', 'to +V'),
    },
  },
  {
    group: 'Toy keyboard',
    part: KNIFE,
    name: 'melody in clumps',
    blurb:
      'Two note wires soldered to each other, so the tune lands on a lattice instead of on its own intervals',
    patch: {
      chipDataLine: pick('chipDataLine', 'D1'),
      chipDataFault: pick('chipDataFault', 'bridged'),
    },
  },
  {
    group: 'Toy keyboard',
    part: KNIFE,
    name: 'the tune in the bass',
    blurb:
      'The two wires carrying the big intervals soldered to each other — a note asking for one of them gets neither, and the melody keeps its shape an octave or two underneath itself',
    patch: {
      chipDataLine: pick('chipDataLine', 'D3'),
      chipDataFault: pick('chipDataFault', 'bridged'),
    },
  },
  {
    group: 'Toy keyboard',
    part: KNIFE,
    name: 'half a tune',
    blurb:
      'The top address wire on the floor — the song folds into its own first half and stays there',
    patch: {
      chipAddrLine: pick('chipAddrLine', 'A3'),
      chipAddrFault: pick('chipAddrFault', 'to ground'),
    },
  },
  {
    group: 'Toy keyboard',
    part: KNIFE,
    name: 'every step twice',
    blurb:
      'The bottom address wire low — the counter counts as it always did and the ROM hands back each step twice',
    patch: {
      chipAddrLine: pick('chipAddrLine', 'A0'),
      chipAddrFault: pick('chipAddrFault', 'to ground'),
    },
  },
  {
    group: 'Toy keyboard',
    part: KNIFE,
    name: 'two songs at once',
    blurb:
      'A trace half cut — most steps arrive, the rest come back stale, and the melody flickers between two versions of itself',
    patch: {
      chipAddrLine: pick('chipAddrLine', 'A1'),
      chipAddrFault: pick('chipAddrFault', 'cut'),
      chipBusCut: 0.5,
    },
  },
  {
    group: 'Toy drums',
    part: KNIFE,
    name: 'machine-gun',
    blurb:
      'The hat’s trigger wire held high — it fires on every step the machine fetches, and everything soldered to the trigger bus hears it',
    patch: {
      drumDataLine: pick('drumDataLine', 'D2'),
      drumDataFault: pick('drumDataFault', 'to +V'),
    },
  },
  {
    group: 'Toy drums',
    part: KNIFE,
    name: 'what both rows agree on',
    blurb:
      'Kick and snare soldered together — a busy pattern thins to the steps the pair have in common',
    patch: {
      drumDataLine: pick('drumDataLine', 'D0'),
      drumDataFault: pick('drumDataFault', 'bridged'),
    },
  },
  {
    group: 'Toy drums',
    part: KNIFE,
    name: 'every step twice',
    blurb:
      'The bottom address wire low — the playhead runs the bar you wrote and the memory answers with half of it, twice over',
    patch: {
      drumAddrLine: pick('drumAddrLine', 'A0'),
      drumAddrFault: pick('drumAddrFault', 'to ground'),
    },
  },
  {
    group: 'Toy drums',
    part: KNIFE,
    name: 'back half of the bar',
    blurb:
      'The top address wire high — you get the second half of the pattern and never the first',
    patch: {
      drumAddrLine: pick('drumAddrLine', 'A3'),
      drumAddrFault: pick('drumAddrFault', 'to +V'),
    },
  },
  {
    group: 'Toy drums',
    part: KNIFE,
    name: 'coming apart',
    blurb:
      'A trace half cut — most fetches land, the occasional one does not, and the pattern comes apart a step at a time',
    patch: {
      drumAddrLine: pick('drumAddrLine', 'A0'),
      drumAddrFault: pick('drumAddrFault', 'cut'),
      drumBusCut: 0.4,
    },
  },
  {
    group: 'FM chip',
    part: KNIFE,
    name: 'the note never ends',
    blurb:
      'The bit carrying the key coming back up cannot go low, so nothing the chip is told to play ever stops',
    patch: {
      fmDataLine: pick('fmDataLine', 'D4'),
      fmDataFault: pick('fmDataFault', 'to +V'),
    },
  },
  {
    group: 'FM chip',
    part: KNIFE,
    name: 'sub, not bells',
    blurb:
      'The top two octave bits soldered together, so the chip cannot be told a high octave unless it asks for the very top — every voice lands in the bottom of its range and the sub comes up with it',
    patch: {
      fmDataLine: pick('fmDataLine', 'D2'),
      fmDataFault: pick('fmDataFault', 'bridged'),
    },
  },
  {
    group: 'FM chip',
    part: KNIFE,
    name: 'the bottom of every octave',
    blurb:
      'The bottom bit of every byte on the floor: the frequency loses its top bit, the operators lose the bottom of their multipliers, and a chip that was ringing sits down',
    patch: {
      fmDataLine: pick('fmDataLine', 'D0'),
      fmDataFault: pick('fmDataFault', 'to ground'),
    },
  },
  {
    group: 'FM chip',
    part: KNIFE,
    name: 'a patch nearly right',
    blurb:
      'A byte wire half cut — most writes land and the odd one arrives stale, so patches come out wrong and stay wrong',
    patch: {
      fmDataLine: pick('fmDataLine', 'D1'),
      fmDataFault: pick('fmDataFault', 'cut'),
      fmBusCut: 0.55,
    },
  },
  {
    group: 'FM chip',
    part: KNIFE,
    name: 'wrong register',
    blurb:
      'Every odd register filed on top of the even one below it — the four voices stop having frequencies of their own',
    patch: {
      fmAddrLine: pick('fmAddrLine', 'A0'),
      fmAddrFault: pick('fmAddrFault', 'to ground'),
    },
  },
  {
    group: 'FM chip',
    part: KNIFE,
    name: 'octave up, with a cliff',
    blurb:
      'The wire that mirrors the quarter wave held, so the quarter simply runs twice — the note is right and the wave has a step in it',
    patch: {
      fmWaveLine: pick('fmWaveLine', 'W8'),
      fmWaveFault: pick('fmWaveFault', 'to ground'),
    },
  },
  {
    group: 'FM chip',
    part: KNIFE,
    name: 'no fundamental',
    blurb:
      'The sign bit of the sine table nailed — a rectified wave, all octave and nothing underneath it',
    patch: {
      fmWaveLine: pick('fmWaveLine', 'W9'),
      fmWaveFault: pick('fmWaveFault', 'to ground'),
    },
  },
  {
    group: 'FM chip',
    part: KNIFE,
    name: 'one write late',
    blurb:
      'The latch misses often enough that every byte commits to the register the write before it named',
    patch: { fmStrobe: 0.5 },
  },
]

function groupOf(name: string) {
  const group = GROUPS.find(g => g.name === name)
  if (!group) throw new Error(`no group '${name}'`)
  return group
}

/** Every control filed under one heading of a group. */
export function partKeys(group: string, part: string): ControlKey[] {
  return groupOf(group)
    .sliders.filter(s => s.part === part)
    .map(s => s.key)
}

/** The cut read back as the controls it moves, in the panel's own words. */
export const cutSays = (cut: CutDef): string =>
  partKeys(cut.group, cut.part)
    .flatMap(key => {
      const value = cut.patch[key]
      const def = sliderFor(key)
      return value === undefined
        ? []
        : `${def.label} ${formatValue(def, value)}`
    })
    .join(' · ')

export const cutsFor = (group: string, part: string): CutDef[] =>
  CUTS.filter(c => c.group === group && c.part === part)

// Loud enough to be the reason you pressed it. The FM chip boots at zero and a
// cut you cannot hear teaches nothing, so a chip sitting silent comes up — the
// same reason a stage's own roll does not get to land its mix at nothing.
const AUDIBLE = 0.8

// One knife rather than two: the heading goes back where it booted and the cut
// writes its own wires into it, so pressing a second cut is that cut and not
// whatever the last one left behind. Everything outside the heading is left
// exactly where your hand put it.
export function applyCut(cut: CutDef, current: Controls): Controls {
  const next = { ...cutOff(cut.group, cut.part, current), ...cut.patch }
  const level = groupOf(cut.group).sliders.find(s => s.role === 'level')
  if (level && next[level.key] === level.min) next[level.key] = AUDIBLE
  return next
}

/** The knife off the group's buses, and nothing else on the board moved. */
export function cutOff(
  group: string,
  part: string,
  current: Controls,
): Controls {
  const next = { ...current }
  for (const key of partKeys(group, part)) next[key] = DEFAULT_CONTROLS[key]
  return next
}

/** Whether anything under the heading is off where it booted. */
export const cutWired = (group: string, part: string, c: Controls): boolean =>
  partKeys(group, part).some(key => c[key] !== DEFAULT_CONTROLS[key])

/** Whether this cut is the knife the board is standing on. */
export const cutStands = (cut: CutDef, c: Controls): boolean =>
  partKeys(cut.group, cut.part).every(
    key => c[key] === (cut.patch[key] ?? DEFAULT_CONTROLS[key]),
  )

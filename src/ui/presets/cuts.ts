import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls.ts'
import { SUPPLY } from '../../dsp/supplies.ts'
import { choiceValue, GROUPS, sliderFor } from '../controls/index.ts'
import { formatValue } from '../slider-scale.ts'

// A fault on a bus is three controls that only mean anything together — a wire,
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

const BUS = 'fault on the bus'
const DIE = 'die and driver'
const SAMPLE_ROM = 'Sample ROM'
const AMP = 'the amp'
const SPEAKER = 'the speaker'

const pick = choiceValue

export const CUTS: CutDef[] = [
  {
    group: 'Plinky',
    part: BUS,
    name: 'rests fill in',
    blurb:
      'A note wire held high — the song keeps its rhythm and its silences become notes',
    patch: {
      chipDataLine: pick('chipDataLine', 'D2'),
      chipDataFault: pick('chipDataFault', 'to +V'),
    },
  },
  {
    group: 'Plinky',
    part: BUS,
    name: 'melody in clumps',
    blurb:
      'Two note wires soldered to each other, so the tune’s pitches fall on a lattice instead of on its intervals',
    patch: {
      chipDataLine: pick('chipDataLine', 'D1'),
      chipDataFault: pick('chipDataFault', 'bridged'),
    },
  },
  {
    group: 'Plinky',
    part: BUS,
    name: 'the tune in the bass',
    blurb:
      'The two wires carrying the big intervals soldered to each other — a note that needs one of them gets neither, and the melody keeps its shape an octave or two lower',
    patch: {
      chipDataLine: pick('chipDataLine', 'D3'),
      chipDataFault: pick('chipDataFault', 'bridged'),
    },
  },
  {
    group: 'Plinky',
    part: BUS,
    name: 'half a tune',
    blurb:
      'The top address wire on the floor — the song folds into its first half and stays there',
    patch: {
      chipAddrLine: pick('chipAddrLine', 'A3'),
      chipAddrFault: pick('chipAddrFault', 'to ground'),
    },
  },
  {
    group: 'Plinky',
    part: BUS,
    name: 'every step twice',
    blurb:
      'The bottom address wire low — the counter counts as it always did and the ROM hands back each step twice',
    patch: {
      chipAddrLine: pick('chipAddrLine', 'A0'),
      chipAddrFault: pick('chipAddrFault', 'to ground'),
    },
  },
  {
    group: 'Plinky',
    part: BUS,
    name: 'two songs at once',
    blurb:
      'A trace half cut — most steps arrive, and the rest come back off the wire next door, so the melody flickers between two versions of itself',
    patch: {
      chipAddrLine: pick('chipAddrLine', 'A1'),
      chipAddrFault: pick('chipAddrFault', 'cut'),
      chipBusCut: 0.5,
    },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'machine-gun',
    blurb:
      'The hat’s trigger wire held high — it fires on every step the machine fetches, and everything soldered to the trigger bus receives the trigger',
    patch: {
      drumDataLine: pick('drumDataLine', 'D2'),
      drumDataFault: pick('drumDataFault', 'to +V'),
    },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'kick on every step',
    blurb:
      'The kick’s trigger wire held high — the kick fires on every step the machine fetches, and the bar goes under everything else',
    patch: {
      drumDataLine: pick('drumDataLine', 'D0'),
      drumDataFault: pick('drumDataFault', 'to +V'),
    },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'what both rows agree on',
    blurb:
      'Kick and snare soldered together — a busy pattern thins to the steps the pair have in common',
    patch: {
      drumDataLine: pick('drumDataLine', 'D0'),
      drumDataFault: pick('drumDataFault', 'bridged'),
    },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'accent on everything',
    blurb:
      'The wire above the voices held high — the accent bus fires on every step, so with Accent sag up each step’s weight depends on how many voices it strikes',
    patch: {
      drumDataLine: pick('drumDataLine', 'D8'),
      drumDataFault: pick('drumDataFault', 'to +V'),
    },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'every step twice',
    blurb:
      'The bottom address wire low — the playhead runs the bar you wrote and the memory answers with half of it, twice over',
    patch: {
      drumAddrLine: pick('drumAddrLine', 'A0'),
      drumAddrFault: pick('drumAddrFault', 'to ground'),
    },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'back half of the bar',
    blurb:
      'The top address wire high — you get the second half of the pattern and never the first',
    patch: {
      drumAddrLine: pick('drumAddrLine', 'A3'),
      drumAddrFault: pick('drumAddrFault', 'to +V'),
    },
  },
  {
    group: 'Clatter',
    part: BUS,
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
    group: 'Clatter',
    part: BUS,
    name: 'the bar walks',
    blurb:
      'The counter’s clock, missing an edge here and there — every step still fires, but one in six of them fires twice and the bar never comes back to where it started',
    patch: { drumSlip: 0.16 },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'five-step bar',
    blurb:
      'The snare’s trigger line on the counter’s clear pin. The first snare sends the counter back to step one, so the rock beat comes round every five steps',
    patch: { drumReset: pick('drumReset', 'on the snare') },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'writes its own pattern',
    blurb:
      'An XOR in the loop the bar circulates through — every lap mixes each step with the next, so the beat grows into patterns nobody drew and comes back within 255 bars',
    patch: { drumLoop: pick('drumLoop', 'return through an XOR') },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'inside out every other bar',
    blurb:
      'The circulating bar’s return inverted — each lap plays the last one’s gaps, so a sparse bar and a bar of every voice on nearly every step take turns',
    patch: { drumLoop: pick('drumLoop', 'return inverted') },
  },
  {
    group: 'Clatter',
    part: SAMPLE_ROM,
    name: 'the kick plays the kit',
    blurb:
      'The end stop on the slab counter cut, so the counter continues through every slab after the voice’s slab and one kick hit plays four seconds of the kit',
    patch: {
      drumRom: 1,
      drumRomCount: pick('drumRomCount', 'runs on through the ROM'),
    },
  },
  {
    group: 'Clatter',
    part: SAMPLE_ROM,
    name: 'every hit backwards',
    blurb:
      'The up/down pin on the slab counter wired, so each slab plays from its tail to its attack',
    patch: { drumRom: 1, drumRomCount: pick('drumRomCount', 'counts down') },
  },
  {
    group: 'Clatter',
    part: SAMPLE_ROM,
    name: 'folded blat',
    blurb:
      'The top data wire on the sample ROM held high, so every word sits in the top half and each hit folds into a square-edged blat',
    patch: {
      drumRom: 1,
      drumRomDataLine: pick('drumRomDataLine', 'D11'),
      drumRomDataFault: pick('drumRomDataFault', 'to +V'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'the note never ends',
    blurb:
      'The data bit that sets the key cannot go low, so the processor’s key-off write leaves the key on and no note ever stops',
    patch: {
      fmDataLine: pick('fmDataLine', 'D4'),
      fmDataFault: pick('fmDataFault', 'to +V'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'sub, not bells',
    blurb:
      'The top two octave bits soldered together, so the processor can write a high octave only by writing the very top one — every voice lands in the bottom of its range and the sub comes up with it',
    patch: {
      fmDataLine: pick('fmDataLine', 'D2'),
      fmDataFault: pick('fmDataFault', 'bridged'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'the bottom of every octave',
    blurb:
      'The bottom bit of every byte on the floor: the frequency loses its top bit, the operators lose the bottom of their multipliers, and a chip that was ringing sits down',
    patch: {
      fmDataLine: pick('fmDataLine', 'D0'),
      fmDataFault: pick('fmDataFault', 'to ground'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'an instrument with no button',
    blurb:
      'The top wire high, so the number naming which instrument a channel plays stops being zero — the channels leave the patch the panel sent and read the ROM on the die, where seven of the fifteen sounds have no button on the case',
    patch: {
      fmDataLine: pick('fmDataLine', 'D7'),
      fmDataFault: pick('fmDataFault', 'to +V'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'a patch nearly right',
    blurb:
      'A byte wire half cut — most writes land and the odd one arrives off the wire next door, so patches come out wrong and stay wrong',
    patch: {
      fmDataLine: pick('fmDataLine', 'D1'),
      fmDataFault: pick('fmDataFault', 'cut'),
      fmBusCut: 0.55,
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'wrong register',
    blurb:
      'Every odd register filed on top of the even one below it — the four voices no longer have separate frequencies',
    patch: {
      fmAddrLine: pick('fmAddrLine', 'A0'),
      fmAddrFault: pick('fmAddrFault', 'to ground'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'octave up, with a cliff',
    blurb:
      'The wire that mirrors the quarter wave held, so the quarter runs twice — the note is right and the wave has a step in it',
    patch: {
      fmWaveLine: pick('fmWaveLine', 'W8'),
      fmWaveFault: pick('fmWaveFault', 'to ground'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'sine into noise',
    blurb:
      'The sign wire of the sine table parted most of the way. A floating pin has no driver, and this bus is read eight times a sample by a different operator each turn, so it never settles anywhere — the one fault on this chip that comes out louder than no fault at all',
    patch: {
      fmWaveLine: pick('fmWaveLine', 'W9'),
      fmWaveFault: pick('fmWaveFault', 'cut'),
      fmBusCut: 0.85,
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'no fundamental',
    blurb:
      'The sign bit of the sine table held to ground — a rectified wave, all octave and nothing underneath it',
    patch: {
      fmWaveLine: pick('fmWaveLine', 'W9'),
      fmWaveFault: pick('fmWaveFault', 'to ground'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'nothing is ever quiet',
    blurb:
      'The top wire out of the sine table held high, so no sample the chip reads is worth less than half of full scale — the quiet parts of every wave fill in and the note comes out square-edged and buzzing, at the same pitch it always was',
    patch: {
      fmWaveDataLine: pick('fmWaveDataLine', 'T7'),
      fmWaveDataFault: pick('fmWaveDataFault', 'to +V'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'the table goes stale',
    blurb:
      'The top wire out of the sine table parted instead. Eight operators a sample take turns on this one datapath, so the pin holds whichever of them drove it last — the amplitude arrives from a different operator every turn and the chip turns to gravel',
    patch: {
      fmWaveDataLine: pick('fmWaveDataLine', 'T7'),
      fmWaveDataFault: pick('fmWaveDataFault', 'cut'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'a patch that will not hold still',
    blurb:
      'The patch table’s P2 parted most of the way. That wire selects a patch’s tone bytes or its envelope bytes, and it carries a signal only some of the time, so every few milliseconds the operators read a different mix of the two and the note smears into static',
    patch: {
      fmPatchLine: pick('fmPatchLine', 'P2'),
      fmPatchFault: pick('fmPatchFault', 'cut'),
      fmBusCut: 0.85,
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'nine times the note',
    blurb:
      'B3 out of the patch table held high: the top bit of both multipliers, so both operators run at nine times the note and the song comes out three octaves up as a whistle, on half a sine, every decay cut short off the same wire',
    patch: {
      fmPatchDataLine: pick('fmPatchDataLine', 'B3'),
      fmPatchDataFault: pick('fmPatchDataFault', 'to +V'),
    },
  },
  {
    group: 'Parlor',
    part: BUS,
    name: 'the top bit sticks',
    blurb:
      'The top wire out of the sample ROM held high — the bottom half of every wave folds up onto the top of it, and the pad comes back as a rectified buzz at the pitch it always was',
    patch: {
      pcmDataLine: pick('pcmDataLine', 'D7'),
      pcmDataFault: pick('pcmDataFault', 'to +V'),
    },
  },
  {
    group: 'Parlor',
    part: BUS,
    name: 'gravel',
    blurb:
      'A notch punched through every word the ROM hands back. The address is right and the sample is not, on every voice, so the note keeps its pitch and loses its surface',
    patch: {
      pcmDataLine: pick('pcmDataLine', 'D5'),
      pcmDataFault: pick('pcmDataFault', 'to ground'),
    },
  },
  {
    group: 'Parlor',
    part: BUS,
    name: 'the voice in clumps',
    blurb:
      'Two of the top wires the ROM answers on soldered to each other — the words snap to a lattice and a voice that was a curve comes out in steps',
    patch: {
      pcmDataLine: pick('pcmDataLine', 'D6'),
      pcmDataFault: pick('pcmDataFault', 'bridged'),
    },
  },
  {
    group: 'Parlor',
    part: BUS,
    name: 'half the wave',
    blurb:
      'The top address wire on the floor. The counter walks the whole recording and the ROM keeps handing back its first half, so every voice loops inside the attack',
    patch: {
      pcmAddrLine: pick('pcmAddrLine', 'A11'),
      pcmAddrFault: pick('pcmAddrFault', 'to ground'),
    },
  },
  {
    group: 'Parlor',
    part: BUS,
    name: 'a word in four',
    blurb:
      'Two address wires soldered to each other, so the counter can only name one word in four — it walks the recording at the rate it always did and gets a staircase back',
    patch: {
      pcmAddrLine: pick('pcmAddrLine', 'A3'),
      pcmAddrFault: pick('pcmAddrFault', 'bridged'),
    },
  },
  {
    group: 'Parlor',
    part: BUS,
    name: 'the loop goes stale',
    blurb:
      'An address trace parted most of the way. The pin has no driver, so it holds whatever the last address left on it and then starts drifting after its neighbour — the one fault on this chip that never stands still',
    patch: {
      pcmAddrLine: pick('pcmAddrLine', 'A7'),
      pcmAddrFault: pick('pcmAddrFault', 'cut'),
      pcmBusCut: 0.85,
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'one write late',
    blurb:
      'The latch misses often enough that every byte commits to the register the write before it named',
    patch: { fmStrobe: 0.5 },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'one voice, four times over',
    blurb:
      'The converter’s slot counter stuck on the first channel — that voice goes out in all four slots, four times as loud into the output stage, and every note that landed elsewhere is gone',
    patch: { fmDacSlot: pick('fmDacSlot', 'stuck on 1') },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'the song upside down',
    blurb:
      'The slot counter running at half speed, so every other sample contains two channels twice and two not at all — the song comes back mirrored about 12 kHz, low notes high and high notes low',
    patch: { fmDacSlip: 0.82 },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'one finger',
    blurb:
      'The driver’s allocator stuck on the first channel: a four-voice chip plays one note at a time, every note chopping the last one’s tail off',
    patch: { fmAlloc: pick('fmAlloc', 'stuck on 1') },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'garbage at power-on',
    blurb:
      'The chip power-cycles into a register file of random bytes — channels that came up keyed drone at random pitches on instruments nobody chose, until a note is played on them',
    patch: { fmColdBoot: pick('fmColdBoot', 'garbage') },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'fades that explode',
    blurb:
      'The part’s log arithmetic on a 10-bit adder that wraps — every note that decays 24 dB comes back at full scale and decays again',
    patch: { fmAdder: pick('fmAdder', '10 bits') },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'sines folded to grit',
    blurb:
      'The log adder cut to 7 bits, so anything 3 dB down wraps back to the top — the quiet middle of every wave folds up into a harsh digital buzz at the pitch it always had',
    patch: { fmAdder: pick('fmAdder', '7 bits') },
  },
  {
    group: 'Crusher',
    part: BUS,
    name: 'the sign bit wanders',
    blurb:
      'The top wire into the DAC parted. Nothing drives the pin, so it holds a word and then drags after D14, and each half of the wave lands in the wrong half a few words at a time',
    patch: {
      crushDataLine: pick('crushDataLine', 'D15'),
      crushDataFault: pick('crushDataFault', 'cut'),
    },
  },
  {
    group: 'Crusher',
    part: BUS,
    name: 'every wave folded up',
    blurb:
      'The top wire held at +V, so every word reads as the top half: the bottom of each wave jumps up a whole half scale and lands on top of the rest',
    patch: {
      crushDataLine: pick('crushDataLine', 'D15'),
      crushDataFault: pick('crushDataFault', 'to +V'),
    },
  },
  {
    group: 'Crusher',
    part: BUS,
    name: 'two bits that agree',
    blurb:
      'D14 soldered to D15. A word keeps both only where both are set, so the four quarters of the wave collapse onto two and the pitch climbs',
    patch: {
      crushDataLine: pick('crushDataLine', 'D14'),
      crushDataFault: pick('crushDataFault', 'bridged'),
    },
  },
  {
    group: 'Crusher',
    part: BUS,
    name: 'a bit that comes and goes',
    blurb:
      'D13 parted most of the way: the bit floats after its neighbour, and every time the trace still conducts the real bit slams back',
    patch: {
      crushDataLine: pick('crushDataLine', 'D13'),
      crushDataFault: pick('crushDataFault', 'cut'),
      crushBusCut: 0.7,
    },
  },
  {
    group: 'Clipper',
    part: AMP,
    name: 'motorboat',
    blurb:
      'The amp on the toy’s own cells, pulling hard: each loud stretch sags the rail, the toy dives about five semitones, the amp mutes, the rail recovers and it pops back in, twelve times a second',
    patch: { distSupply: SUPPLY.shared, distDraw: 1 },
  },
  {
    group: 'Clipper',
    part: AMP,
    name: 'growl on the rail',
    blurb:
      'Pin 7 open and the amp loading the toy’s cells, so its own supply ripple comes back in as a 60 Hz motorboat growl under the tune',
    patch: { distSupply: SUPPLY.shared, distDraw: 0.6, distBypass: 0.8 },
  },
  {
    group: 'Clipper',
    part: AMP,
    name: 'the amp sings',
    blurb:
      'A big cap across pins 1 and 8 for 600 times the gain: the amp runs out of phase margin and holds a 1.1 kHz note over everything',
    patch: { distPinGain: 600 },
  },
  {
    group: 'Clipper',
    part: AMP,
    name: 'pin 7 screams',
    blurb:
      'The bypass cap off pin 7: the amp oscillates at 3 kHz on a full supply and swallows the tune',
    patch: { distBypass: 1 },
  },
  {
    group: 'Clipper',
    part: AMP,
    name: 'chokes on every hit',
    blurb:
      'Two hundred times the gain into a coupling cap that charges on each clipped peak, so the amp shuts after every loud note and sputters back',
    patch: { distPinGain: 200, distBlock: 1 },
  },
  {
    group: 'Clipper',
    part: SPEAKER,
    name: 'phone speaker',
    blurb:
      'A cone the size of a coin: no bass, a honk near 340 Hz and a buzz on every bass note',
    patch: { distSpeaker: 0.5 },
  },
  {
    group: 'Clipper',
    part: SPEAKER,
    name: 'blown cone',
    blurb:
      'The smallest cone, slamming into its stops on every note, so the tune comes out as clicks and rattle',
    patch: { distSpeaker: 1 },
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
// same reason a stage's own roll does not get to land its mix at nothing. A
// bend has no level, so its dry/wet comes up instead.
const AUDIBLE = 0.8

// One fault rather than two: the heading goes back where it booted and the cut
// writes its own wires into it, so pressing a second cut is that cut and not
// whatever the last one left behind. Everything outside the heading is left
// exactly where your hand put it.
export function applyCut(cut: CutDef, current: Controls): Controls {
  const next = { ...cutOff(cut.group, cut.part, current), ...cut.patch }
  const sliders = groupOf(cut.group).sliders
  const level =
    sliders.find(s => s.role === 'level') ?? sliders.find(s => s.role === 'mix')
  if (level && next[level.key] === level.min) next[level.key] = AUDIBLE
  return next
}

/** The fault off the group's buses, and nothing else on the board moved. */
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

/** Whether this cut is the fault the board is standing on. */
export const cutStands = (cut: CutDef, c: Controls): boolean =>
  partKeys(cut.group, cut.part).every(
    key => c[key] === (cut.patch[key] ?? DEFAULT_CONTROLS[key]),
  )

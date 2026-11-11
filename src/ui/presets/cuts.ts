import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls.ts'
import { SUPPLY } from '../../dsp/supplies.ts'
import { type CardSuffix } from '../../monoCard.ts'
import { keyOf, type CardStage } from '../cards.ts'
import { choiceValue, GROUPS, sliderFor } from '../controls/index.ts'
import { MEMORY_FAULTS } from '../controls/monoCard.ts'
import {
  TALK_BUS,
  TALK_CLOCK,
  TALK_FRAMES,
  TALK_MOUTH,
  TALK_PITCH,
} from '../controls/prattle.ts'
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
      'A note wire is held high, so the song keeps its rhythm and its silences become notes',
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
      'Two note wires are soldered to each other, so the tune’s pitches fall on a lattice instead of on its intervals',
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
      'The two wires carrying the big intervals are soldered to each other. A note that needs one of them gets neither, and the melody keeps its shape an octave or two lower',
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
      'The top address wire is grounded, so the song folds into its first half and stays there',
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
      'The bottom address wire is held low, so the counter counts as it always did and the ROM hands back each step twice',
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
      'A trace is half cut. Most steps arrive and the rest come back off the wire next door, so the melody flickers between two versions of itself',
    patch: {
      chipAddrLine: pick('chipAddrLine', 'A1'),
      chipAddrFault: pick('chipAddrFault', 'cut'),
      chipBusCut: 0.5,
    },
  },
  {
    group: 'Plinky',
    part: BUS,
    name: 'the song bit-reversed',
    blurb:
      'The five counter wires reach the ROM in reverse order. Every step still plays, in a fixed shuffle: the second step plays the seventeenth, the third plays the ninth',
    patch: {
      chipAddrLine: pick('chipAddrLine', 'A4'),
      chipAddrFault: pick('chipAddrFault', 'reversed'),
    },
  },
  {
    group: 'Plinky',
    part: BUS,
    name: 'leaps on the way down',
    blurb:
      'Whenever a note code drops several bits at once, the ground lifts and the whole code reads high, so those notes leap to the top of the keyboard',
    patch: {
      chipDataLine: pick('chipDataLine', 'D5'),
      chipDataFault: pick('chipDataFault', 'bounce'),
    },
  },
  {
    group: 'Plinky',
    part: BUS,
    name: 'a probe on the counter',
    blurb:
      'A probe tip wanders up and down the four low counter wires, bridging whichever two it rests between and now and then lifting off, so the song keeps taking different wrong turns',
    patch: {
      chipAddrLine: pick('chipAddrLine', 'A3'),
      chipAddrFault: pick('chipAddrFault', 'probe drag'),
    },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'machine-gun',
    blurb:
      'The hat’s trigger wire is held high, so the hat fires on every step the machine fetches, and everything soldered to the trigger bus receives the trigger',
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
      'The kick’s trigger wire is held high, so the kick fires on every step the machine fetches and the bar goes under everything else',
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
      'Kick and snare are soldered together, so a busy pattern thins to the steps the pair have in common',
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
      'The wire above the voices is held high, so the accent bus fires on every step. With Accent sag up, each step’s weight depends on how many voices it strikes',
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
      'The bottom address wire is held low, so the playhead runs the bar you wrote and the memory answers with half of it, twice over',
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
      'The top address wire is held high, so the machine plays only the second half of the pattern',
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
      'A trace is half cut. Most fetches arrive and the occasional one fails, so the pattern comes apart a step at a time',
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
      'The counter’s clock misses an edge now and then. Every step still fires, but one in six of them fires twice and the bar never comes back to where it started',
    patch: { drumSlip: 0.16 },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'five-step bar',
    blurb:
      'The snare’s trigger line is wired to the counter’s clear pin. The first snare sends the counter back to step one, so the rock beat comes round every five steps',
    patch: { drumReset: pick('drumReset', 'on the snare') },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'writes its own pattern',
    blurb:
      'An XOR sits in the loop the bar circulates through. Every lap mixes each step with the next, so the beat grows into patterns that are not on the grid and comes back within 255 bars',
    patch: { drumLoop: pick('drumLoop', 'return through an XOR') },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'inside out every other bar',
    blurb:
      'The circulating bar’s return is inverted, so each lap plays the last one’s gaps, and a sparse bar and a bar of every voice on nearly every step take turns',
    patch: { drumLoop: pick('drumLoop', 'return inverted') },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'the kit mirrored',
    blurb:
      'The nine trigger wires reach the voices in reverse order. The kick row strikes the accent, the snare row the cymbal, the hat row the open hat and the clap row the bell',
    patch: {
      drumDataLine: pick('drumDataLine', 'D8'),
      drumDataFault: pick('drumDataFault', 'reversed'),
    },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'each row plays the next voice',
    blurb:
      'The eight voice wires are soldered one hole along, so the kick row plays the snare, the snare row the hat, and so on round, with the cymbal row on the kick',
    patch: {
      drumDataLine: pick('drumDataLine', 'D7'),
      drumDataFault: pick('drumDataFault', 'one hole along'),
    },
  },
  {
    group: 'Clatter',
    part: BUS,
    name: 'a probe across the kick, snare and hat',
    blurb:
      'A probe tip wanders across the kick, snare and hat wires. Where it bridges two of them, each fires only where both rows agree, so the beat thins out and fills back in as the hand moves',
    patch: {
      drumDataLine: pick('drumDataLine', 'D2'),
      drumDataFault: pick('drumDataFault', 'probe drag'),
    },
  },
  {
    group: 'Clatter',
    part: SAMPLE_ROM,
    name: 'the kick plays the kit',
    blurb:
      'The end stop on the slab counter is cut, so the counter continues through every slab after the voice’s slab and one kick hit plays four seconds of the kit',
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
      'The up/down pin on the slab counter is wired, so each slab plays from its tail to its attack',
    patch: { drumRom: 1, drumRomCount: pick('drumRomCount', 'counts down') },
  },
  {
    group: 'Clatter',
    part: SAMPLE_ROM,
    name: 'folded blat',
    blurb:
      'The top data wire on the sample ROM is held high, so every word sits in the top half and each hit folds into a square-edged blat',
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
      'The top two octave bits are soldered together, so the processor can write a high octave only by writing the very top one. Every voice lands in the bottom of its range and the sub comes up with it',
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
      'The bottom bit of every byte is grounded, so the frequency loses its top bit, the operators lose the bottom of their multipliers, and a chip that was ringing goes quiet',
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
      'The top wire is held high, so the number that selects a channel’s instrument is no longer zero. The channels leave the patch the panel sent and read the ROM on the die, where seven of the fifteen sounds have no button on the case',
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
      'A byte wire is half cut. Most writes arrive and the odd one comes off the wire next door, so patches come out wrong and stay wrong',
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
      'Every odd register is filed on top of the even one below it, so the four voices no longer have separate frequencies',
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
      'The wire that mirrors the quarter wave is held, so the quarter runs twice. The note is right and the wave has a step in it',
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
      'The sign wire of the sine table is parted most of the way. A floating pin has no driver, and this bus is read eight times a sample by a different operator each turn, so the pin never settles. It is the one fault on this chip that comes out louder than the chip with no fault',
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
      'The sign bit of the sine table is held to ground, so the chip plays a rectified wave, all octave and no fundamental',
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
      'The top wire out of the sine table is held high, so every sample the chip reads is at least half of full scale. The quiet parts of every wave fill in and the note comes out square-edged and buzzing, at the same pitch it always was',
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
      'The top wire out of the sine table is parted. Eight operators a sample take turns on this one datapath, so the pin holds whichever of them drove it last. The amplitude arrives from a different operator every turn and the chip turns to gravel',
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
      'The patch table’s P2 is parted most of the way. That wire selects a patch’s tone bytes or its envelope bytes, and it carries a signal only some of the time, so every few milliseconds the operators read a different mix of the two and the note smears into static',
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
      'B3 out of the patch table is held high. B3 is the top bit of both multipliers, so both operators run at nine times the note and the song comes out three octaves up as a whistle. The same wire also puts the song on half a sine and cuts every decay short',
    patch: {
      fmPatchDataLine: pick('fmPatchDataLine', 'B3'),
      fmPatchDataFault: pick('fmPatchDataFault', 'to +V'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'levels from the wrong operator',
    blurb:
      'E9 between the log adder and the exp table is parted most of the way. It tells the shifter whether to drop a level two octaves, and every operator reads its level across it eight times a sample, so each one keeps getting another’s octave. The tune stays in there under a hiss that follows it',
    patch: {
      fmExpLine: pick('fmExpLine', 'E9'),
      fmExpFault: pick('fmExpFault', 'cut'),
      fmBusCut: 0.7,
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'drops into the bass',
    blurb:
      'The low four address wires are soldered one hole along, so every write lands in another register of its block, always the same one, and the tune falls into the bass',
    patch: {
      fmAddrLine: pick('fmAddrLine', 'A3'),
      fmAddrFault: pick('fmAddrFault', 'one hole along'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'a sine in shreds',
    blurb:
      'All ten wires into the sine table arrive in reverse order, so each lap reads the table in a fixed shuffle. The pitch holds and the sine becomes a bright buzz',
    patch: {
      fmWaveLine: pick('fmWaveLine', 'W9'),
      fmWaveFault: pick('fmWaveFault', 'reversed'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'a probe on the register address',
    blurb:
      'A probe tip wanders up and down the low four register address wires, so writes slide into the wrong registers and back as the hand moves, and the pitch jumps around',
    patch: {
      fmAddrLine: pick('fmAddrLine', 'A3'),
      fmAddrFault: pick('fmAddrFault', 'probe drag'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'every ratio off by the same hertz',
    blurb:
      'I11 between the multiplier and the phase accumulator is held high, so every operator whose step lacks that bit gains about 190 Hz. Modulator and carrier gain the same hertz at different ratios, so their partials stop lining up, and each note clangs differently',
    patch: {
      fmIncLine: pick('fmIncLine', 'I11'),
      fmIncFault: pick('fmIncFault', 'to +V'),
    },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'the tune on a bugle',
    blurb:
      'The phase accumulator loses its carry out of C10, so the low eleven bits of every step wrap on their own and only the part above them turns the phase. Every note snaps down onto the overtones of one low pitch, and the tune comes out as a bugle call',
    patch: { fmCarry: pick('fmCarry', 'C10') },
  },
  {
    group: 'Glint',
    part: BUS,
    name: 'the chip writing its own octave',
    blurb:
      'The chip’s output is soldered onto the low four wires of its own data bus, so its waveform lands in the key register the processor last wrote and sets the octave the note plays in. Low notes change the wires slowly, so the loop sinks into the bottom octaves and churns there',
    patch: { fmSelfBus: 4 },
  },
  {
    group: 'Parlor',
    part: BUS,
    name: 'the top bit sticks',
    blurb:
      'The top wire out of the sample ROM is held high, so the bottom half of every wave folds up onto the top of it, and the pad comes back as a rectified buzz at the pitch it always was',
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
      'A notch is punched through every word the ROM hands back. The address is right and the sample is not, on every voice, so the note keeps its pitch and loses its surface',
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
      'Two of the ROM’s top data wires are soldered to each other, so the words snap to a lattice and a voice that was a curve comes out in steps',
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
      'The top address wire is grounded. The counter walks the whole recording and the ROM keeps handing back its first half, so every voice loops inside the attack',
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
      'Two address wires are soldered to each other, so the counter can address only one word in four. It walks the recording at the rate it always did and gets a staircase back',
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
      'An address trace is parted most of the way. The pin has no driver, so it holds whatever the last address left on it and then starts drifting after its neighbour. It is the one fault on this chip whose sound keeps changing',
    patch: {
      pcmAddrLine: pick('pcmAddrLine', 'A7'),
      pcmAddrFault: pick('pcmAddrFault', 'cut'),
      pcmBusCut: 0.85,
    },
  },
  {
    group: 'Parlor',
    part: BUS,
    name: 'folded over',
    blurb:
      'The eight data wires are soldered one hole along. Every word arrives doubled, and the part that no longer fits wraps round to the other side, so each wave folds over itself into a hard buzz',
    patch: {
      pcmDataLine: pick('pcmDataLine', 'D7'),
      pcmDataFault: pick('pcmDataFault', 'one hole along'),
    },
  },
  {
    group: 'Parlor',
    part: BUS,
    name: 'grains of itself',
    blurb:
      'The low ten address wires arrive in reverse order. The counter still runs at the key’s pitch, but each step jumps across the sample in a fixed shuffle, and the voice shreds into a hiss of its own grains',
    patch: {
      pcmAddrLine: pick('pcmAddrLine', 'A9'),
      pcmAddrFault: pick('pcmAddrFault', 'reversed'),
    },
  },
  {
    group: 'Parlor',
    part: BUS,
    name: 'a probe up the address',
    blurb:
      'A probe tip wanders along the low twelve address wires. Low down it only roughens the voice, and as it drifts up it bridges wires that jump the read across the sample',
    patch: {
      pcmAddrLine: pick('pcmAddrLine', 'A11'),
      pcmAddrFault: pick('pcmAddrFault', 'probe drag'),
    },
  },
  {
    group: 'Prattle',
    part: TALK_CLOCK,
    name: 'giant',
    blurb:
      'The RC clock starved, so the voice, the speed and the formants all sink together',
    patch: { talkClock: 0.4 },
  },
  {
    group: 'Prattle',
    part: TALK_CLOCK,
    name: 'chipmunk',
    blurb: 'The RC clock pushed, so it chatters high and fast',
    patch: { talkClock: 2.4 },
  },
  {
    group: 'Prattle',
    part: TALK_CLOCK,
    name: 'smear',
    blurb:
      'The frame clock divided by six and the pitch left alone, so each word stretches into a slow glide',
    patch: { talkFrameDiv: pick('talkFrameDiv', '÷6') },
  },
  {
    group: 'Prattle',
    part: TALK_CLOCK,
    name: 'drone',
    blurb:
      'The frame clock stopped. Each start holds its first voiced frame, so every hit is a new held vowel',
    patch: { talkFrameDiv: pick('talkFrameDiv', 'stopped') },
  },
  {
    group: 'Prattle',
    part: TALK_CLOCK,
    name: 'on the grid',
    blurb:
      'The frame counter runs off the kit’s step counter, four frames a step, so the words march with the pattern',
    patch: { talkLock: pick('talkLock', 'kit step ×4') },
  },
  {
    group: 'Prattle',
    part: TALK_FRAMES,
    name: 'stutter',
    blurb:
      'The carry out of A1 is cut, so the counter loops four frames and a syllable repeats, slipping on now and then',
    patch: { talkLoopBit: pick('talkLoopBit', 'A1'), talkLoopSlip: 0.2 },
  },
  {
    group: 'Prattle',
    part: TALK_FRAMES,
    name: 'stuck syllable',
    blurb:
      'The carry out of A2 is cut clean, so eight frames of ROM go round until the next word is struck',
    patch: { talkLoopBit: pick('talkLoopBit', 'A2'), talkLoopSlip: 0 },
  },
  {
    group: 'Prattle',
    part: TALK_FRAMES,
    name: 'skipping record',
    blurb:
      'The carry out of A0 is half there, so it trips over every other frame on its way through the word',
    patch: { talkLoopBit: pick('talkLoopBit', 'A0'), talkLoopSlip: 0.5 },
  },
  {
    group: 'Prattle',
    part: TALK_BUS,
    name: 'howl',
    blurb:
      'D10 held high adds one to every coefficient, so the lattice goes unstable and screams for as long as it talks',
    patch: {
      talkDataLine: pick('talkDataLine', 'D10'),
      talkDataFault: pick('talkDataFault', 'to +V'),
    },
  },
  {
    group: 'Prattle',
    part: TALK_BUS,
    name: 'screech in the gaps',
    blurb:
      'The sign line grounded, so only the negative coefficients tip past one and the words break into screeches',
    patch: {
      talkDataLine: pick('talkDataLine', 'D11'),
      talkDataFault: pick('talkDataFault', 'to ground'),
    },
  },
  {
    group: 'Prattle',
    part: TALK_BUS,
    name: 'comes and goes',
    blurb:
      'D10 cut most of the way, so it floats after its neighbour and the howl breaks through the words and lets go',
    patch: {
      talkDataLine: pick('talkDataLine', 'D10'),
      talkDataFault: pick('talkDataFault', 'cut'),
      talkBusCut: 0.97,
    },
  },
  {
    group: 'Prattle',
    part: TALK_BUS,
    name: 'alien vowels',
    blurb:
      'A5 held high, so each lattice stage reads its neighbour’s table and every vowel comes out wrong the same way',
    patch: {
      talkAddrLine: pick('talkAddrLine', 'A5'),
      talkAddrFault: pick('talkAddrFault', 'to +V'),
    },
  },
  {
    group: 'Prattle',
    part: TALK_PITCH,
    name: 'growl',
    blurb:
      'P4 grounded, so the voice drops most of an octave and the rises fall instead',
    patch: {
      talkPitchLine: pick('talkPitchLine', 'P4'),
      talkPitchFault: pick('talkPitchFault', 'to ground'),
    },
  },
  {
    group: 'Prattle',
    part: TALK_PITCH,
    name: 'whistling hiss',
    blurb:
      'P5 held high, so the voice jumps up and the whispered sounds get a pitch of their own',
    patch: {
      talkPitchLine: pick('talkPitchLine', 'P5'),
      talkPitchFault: pick('talkPitchFault', 'to +V'),
    },
  },
  {
    group: 'Prattle',
    part: TALK_PITCH,
    name: 'whisper',
    blurb:
      'The voicing gate stuck on the noise register, so every word is breath',
    patch: { talkVoicing: pick('talkVoicing', 'stuck on hiss') },
  },
  {
    group: 'Prattle',
    part: TALK_MOUTH,
    name: 'the board speaks',
    blurb:
      'The board’s output leaks onto the excitation line, so the kit is shaped into the words',
    patch: { talkLeak: 0.6 },
  },
  {
    group: 'Prattle',
    part: TALK_MOUTH,
    name: 'ten wrong mouths',
    blurb:
      'The coefficient stack misses a shift on every other frame, so the words keep their rhythm and pass through ten shapes of mouth before the stack lines up again',
    patch: { talkStackSlip: 1 },
  },
  {
    group: 'Prattle',
    part: TALK_MOUTH,
    name: 'croak and squeal',
    blurb:
      'The interpolator steps three times too far toward each frame, so the registers wrap and the voice flips between a croak and a squeal',
    patch: { talkOvershoot: 1 },
  },
  {
    group: 'Prattle',
    part: TALK_PITCH,
    name: 'sings the toy’s tune',
    blurb:
      'Plinky’s output pin restarts the pitch counter, so the voiced sounds take the tune’s notes',
    patch: { talkSingFrom: pick('talkSingFrom', 'Plinky') },
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
      'The converter’s slot counter is stuck on the first channel, so that voice goes out in all four slots, four times as loud into the output stage, and every note that landed elsewhere is gone',
    patch: { fmDacSlot: pick('fmDacSlot', 'stuck on 1') },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'the song upside down',
    blurb:
      'The slot counter runs at half speed, so every other sample contains two channels twice and omits the other two. The song comes back mirrored about 12 kHz, low notes high and high notes low',
    patch: { fmDacSlip: 0.82 },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'one finger',
    blurb:
      'The driver’s allocator is stuck on the first channel, so a four-voice chip plays one note at a time and every note cuts off the last one’s tail',
    patch: { fmAlloc: pick('fmAlloc', 'stuck on 1') },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'garbage at power-on',
    blurb:
      'The chip power-cycles into a register file of random bytes. Channels that came up keyed drone at random pitches on random instruments until a note is played on them',
    patch: { fmColdBoot: pick('fmColdBoot', 'garbage') },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'fades that explode',
    blurb:
      'The part’s log arithmetic runs on a 10-bit adder that wraps, so every note that decays 24 dB comes back at full scale and decays again',
    patch: { fmAdder: pick('fmAdder', '10 bits') },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'sines folded to grit',
    blurb:
      'The log adder is cut to 7 bits, so anything 3 dB down wraps back to the top. The quiet middle of every wave folds up into a harsh digital buzz at the pitch it always had',
    patch: { fmAdder: pick('fmAdder', '7 bits') },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'each note on the one before',
    blurb:
      'The latch in front of the phase accumulator runs a slot late. Each carrier plays at its modulator’s pitch and each modulator at the pitch of the channel before it, so the notes still ringing bend the one being played',
    patch: { fmSkew: 1 },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'the modulator on the pitch wire',
    blurb:
      'A wire puts each modulator’s output on its carrier’s frequency rather than its phase. The swing is the same in hertz on every note, so low notes run through zero and backwards while high ones only buzz',
    patch: { fmPitchWire: 1 },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'the tune five octaves down',
    blurb:
      'The wave table’s sign wire comes off the fifth stage of a divider that counts each operator’s wraps, so every sine flips polarity once in 32 cycles. Each note drops five octaves into a square-edged sub, and the FM swing lands the flips mid-wave, so the sub growls',
    patch: { fmSign: pick('fmSign', '÷32') },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'a rumble the chip feeds itself',
    blurb:
      'The output shares a ground with the wave table, so the output under 80 Hz lifts every operator’s phase. The loop oscillates below 120 Hz as soon as a note sounds, and every note of the tune bends around the rumble',
    patch: { fmGroundLoop: 1 },
  },
  {
    group: 'Glint',
    part: DIE,
    name: 'every chord on its difference tones',
    blurb:
      'The output latch is clocked off the first channel’s carrier, so the chip’s output updates once per cycle of that voice. The other notes alias against it, and every chord folds down into a growl under 120 Hz',
    patch: { fmLatch: pick('fmLatch', 'voice 1') },
  },
  {
    group: 'Crusher',
    part: BUS,
    name: 'the sign bit wanders',
    blurb:
      'The top wire into the DAC is parted. The pin has no driver, so it holds a word and then drags after D14, and each half of the wave lands in the wrong half a few words at a time',
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
      'The top wire is held at +V, so every word reads as the top half: the bottom of each wave jumps up a whole half scale and lands on top of the rest',
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
      'D14 is soldered to D15. A word keeps both only where both are set, so the four quarters of the wave collapse onto two and the pitch climbs',
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
      'D13 is parted most of the way, so the bit floats after its neighbour, and every time the trace still conducts the real bit slams back',
    patch: {
      crushDataLine: pick('crushDataLine', 'D13'),
      crushDataFault: pick('crushDataFault', 'cut'),
      crushBusCut: 0.7,
    },
  },
  {
    group: 'Crusher',
    part: BUS,
    name: 'every word backwards',
    blurb:
      'All sixteen wires arrive in reverse order, so the quiet low bits become the loud top ones and the board turns to a hiss that follows its loudness',
    patch: {
      crushDataLine: pick('crushDataLine', 'D15'),
      crushDataFault: pick('crushDataFault', 'reversed'),
    },
  },
  {
    group: 'Crusher',
    part: BUS,
    name: 'spits on the jumps',
    blurb:
      'When several wires fall at once, the ground lifts and every quiet wire reads high for that word, so the busier the board the more it spits',
    patch: {
      crushDataLine: pick('crushDataLine', 'D15'),
      crushDataFault: pick('crushDataFault', 'bounce'),
    },
  },
  {
    group: 'Clipper',
    part: AMP,
    name: 'motorboat',
    blurb:
      'The amp runs on the toy’s own cells and pulls hard. Each loud stretch sags the rail, the toy dives about five semitones, the amp mutes, the rail recovers and the amp pops back in, twelve times a second',
    patch: { distSupply: SUPPLY.shared, distDraw: 1 },
  },
  {
    group: 'Clipper',
    part: AMP,
    name: 'growl on the rail',
    blurb:
      'Pin 7 is open and the amp loads the toy’s cells, so the amp’s supply ripple comes back in as a 60 Hz motorboat growl under the tune',
    patch: { distSupply: SUPPLY.shared, distDraw: 0.6, distBypass: 0.8 },
  },
  {
    group: 'Clipper',
    part: AMP,
    name: 'the amp sings',
    blurb:
      'A big cap across pins 1 and 8 gives 600 times the gain, so the amp runs out of phase margin and holds a 1.1 kHz note over everything',
    patch: { distPinGain: 600 },
  },
  {
    group: 'Clipper',
    part: AMP,
    name: 'pin 7 screams',
    blurb:
      'With the bypass cap off pin 7, the amp oscillates at 3 kHz on a full supply and drowns out the tune',
    patch: { distBypass: 1 },
  },
  {
    group: 'Clipper',
    part: AMP,
    name: 'chokes on every hit',
    blurb:
      'The amp runs at two hundred times the gain into a coupling cap that charges on each clipped peak, so the amp shuts after every loud note and sputters back',
    patch: { distPinGain: 200, distBlock: 1 },
  },
  {
    group: 'Clipper',
    part: SPEAKER,
    name: 'phone speaker',
    blurb:
      'The speaker is a cone the size of a coin, so it has no bass, a honk near 340 Hz and a buzz on every bass note',
    patch: { distSpeaker: 0.5 },
  },
  {
    group: 'Clipper',
    part: SPEAKER,
    name: 'blown cone',
    blurb:
      'The smallest cone slams into its stops on every note, so the tune comes out as clicks and rattle',
    patch: { distSpeaker: 1 },
  },
  ...memoryCuts('Growler'),
  ...memoryCuts('Howler'),
]

// The same faults on either card's memory, so Growler and Howler bend apart.
function memoryCuts(stage: CardStage): CutDef[] {
  const key = <S extends CardSuffix>(suffix: S) => keyOf(stage, suffix)
  const at = (suffix: CardSuffix, choice: string) => pick(key(suffix), choice)
  const cut = (
    name: string,
    blurb: string,
    patch: Partial<Controls>,
  ): CutDef => ({ group: stage, part: MEMORY_FAULTS, name, blurb, patch })
  return [
    cut(
      'smear',
      'The write enable leaks, so now and then a note is written into the step after it, and over the laps the line smears into repeats',
      { [key('SeqLeak')]: 0.3 },
    ),
    cut(
      'one note',
      'The write enable is stuck, so every note is written into the next step and within a lap the line is one note, drifting a bit at a time',
      { [key('SeqLeak')]: 1 },
    ),
    cut(
      'rot',
      'The refresh is starved and a bit leaks every beat, so the notes sink, the rests turn into notes, and the accents and slides drop out one by one',
      { [key('SeqRot')]: at('SeqRot', 'every beat') },
    ),
    cut(
      'folded loop',
      'The counter’s carry is cut, so it wraps at 8 and the line folds into its first eight steps',
      { [key('SeqCarry')]: at('SeqCarry', 'wraps at 8') },
    ),
    cut(
      'every step twice',
      'The bottom address wire is grounded, so the memory hands back each even step twice and the odd ones never play',
      {
        [key('SeqAddrLine')]: at('SeqAddrLine', 'A0'),
        [key('SeqAddrFault')]: at('SeqAddrFault', 'to ground'),
      },
    ),
    cut(
      'out of order',
      'A1 and A2 are crossed, so the middle pairs of every eight steps trade places, the same way every lap',
      { [key('SeqAddrCross')]: at('SeqAddrCross', 'A1↔A2') },
    ),
    cut(
      'wrong notes',
      'D3 is held high, so every note without that bit plays eight semitones up, the same wrong notes every lap',
      {
        [key('SeqDataLine')]: at('SeqDataLine', 'D3 +8'),
        [key('SeqDataFault')]: at('SeqDataFault', 'to +V'),
      },
    ),
    cut(
      'rests fill in',
      'D5 is grounded, so every rest plays F♯4 and every note from G4 up falls 32 semitones',
      {
        [key('SeqDataLine')]: at('SeqDataLine', 'D5 +32'),
        [key('SeqDataFault')]: at('SeqDataFault', 'to ground'),
      },
    ),
    cut(
      'accent on everything',
      'The accent wire is held high, so every step lands accented',
      {
        [key('SeqDataLine')]: at('SeqDataLine', 'D6 accent'),
        [key('SeqDataFault')]: at('SeqDataFault', 'to +V'),
      },
    ),
    cut(
      'all slide',
      'The slide wire is held high, so every note glides into the next and the gate never lifts',
      {
        [key('SeqDataLine')]: at('SeqDataLine', 'D7 slide'),
        [key('SeqDataFault')]: at('SeqDataFault', 'to +V'),
      },
    ),
  ]
}

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

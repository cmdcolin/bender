import type { ControlKey } from './controls.ts'
import type { MIC } from './dsp/micJacks.ts'
import type { DEST } from './dsp/modbus.ts'

// Every sound source on the board, one record each, in the order the chain sums
// them. The desk, the meters, the stems, the supplies, the mic jacks, the gate
// line, the trigger patch, the map, the bench, MIDI and the features doc all
// read their lists of machines off this one. It imports types and nothing else,
// so the audio thread reads it without bringing any of the panel along.
//
// A new machine goes on the end, because its place here is its meter tap, its
// Patched into choice and its slot on the desk, which saved boards and the audio
// thread count by.

/** A lane on the patch bay that is also a control: a fader a bay wire rides. */
type Lane = ControlKey & keyof typeof DEST

/** A jack on the machine that the mic wire can be soldered to. */
export interface MachineJack {
  /** Its micPatch value, by the name micJacks.ts gives it. */
  jack: keyof typeof MIC
  /** The micPatch choice, and the jack's label in the patch drawing. */
  name: string
  /** What the jack is on the machine. */
  part: string
  /** What a voice does there. */
  says: string
}

interface MachineSpec {
  /** The audio thread's name for it, which is its meter tap's. */
  tap: string
  /** What the panel, the map, the desk and the bench call it. */
  name: string
  /** What it is, as Add instrument and the mic menu say. */
  kind: string
  /** Its stem's name in a folder of downloads. */
  stem: string
  /** Its faders, the desk's first: any of them up puts it on the board. The
      first is also the lane a bay wire rides it on. */
  levels: readonly [Lane, ...ControlKey[]]
  /** Its fader is the player's monitoring level rather than the look's. */
  yours?: true
  mute?: ControlKey
  /** Its Supply selector, for a machine on the toy's battery rail. */
  supply?: ControlKey
  /** The keybed its notes arrive on, as a note message names it. */
  keybed?: string
  /** Its jumper on Plinky's gate line. */
  keyGate?: ControlKey
  /** The kit trigger line that strikes it. */
  struck?: ControlKey
  /** Where a fresh cable into its CV jack lands. */
  cv?: keyof typeof DEST
  /** Its mic jacks, wildest first. */
  mic?: readonly MachineJack[]
  /** Where the map draws it: on the toy board, along the top or under it when
      the panel wraps the row, or on the line row off the rail. */
  map: 'top' | 'under' | 'line'
  /** Whether it has a face on the bench. */
  face?: true
  /** Its paragraph in docs/features.md. */
  blurb: string
}

export const MACHINES = [
  {
    tap: 'toyChip',
    name: 'Plinky',
    kind: 'toy keyboard',
    stem: 'toy',
    levels: ['chipLevel'],
    mute: 'chipMute',
    supply: 'chipSupply',
    keybed: 'toy',
    cv: 'chipClock',
    mic: [
      {
        jack: 'toyClock',
        name: 'toy clock',
        part: 'clock pin',
        says: 'the pitch of your voice sets the tempo and tuning, and silence slows the toy to clicks',
      },
      {
        jack: 'toyAddr',
        name: 'toy addr',
        part: 'address bus',
        says: 'louder sounds jump further through the song',
      },
      {
        jack: 'toyData',
        name: 'toy data',
        part: 'data bus',
        says: 'talking shifts the notes and yelling scrambles them',
      },
      {
        jack: 'toyRail',
        name: 'chip rail',
        part: 'supply rail',
        says: 'yelling browns the toy out',
      },
    ],
    map: 'top',
    face: true,
    blurb:
      'A square-wave divider chip running a ROM, with a tone control that taps the divider at a different width, an auto bass-chord section, playable voices over the top and six effect buttons that sweep the divider. Its clock, counter, bias and gate are each a place to solder a pot onto: *Bend spot* picks which and *Bend pot* sets how far. The panel *Power supply* holds the battery rail that Plinky shares with four other machines.',
  },
  {
    tap: 'toyDrum',
    name: 'Clatter',
    kind: 'toy drums',
    stem: 'drums',
    levels: ['drumLevel'],
    mute: 'drumMute',
    supply: 'drumSupply',
    cv: 'drumTune',
    mic: [
      {
        jack: 'drumTrig',
        name: 'drum trig',
        part: 'trigger line',
        says: 'a clap fires the kit',
      },
    ],
    map: 'under',
    face: true,
    blurb:
      'A step grid with a length per row, so a five-step hat runs against a sixteen-step kick until they line back up. *Retrigger* repeats the current step at audio rate. *Cross-patch* connects one voice’s amplifier to another’s envelope, so a hit on one voice opens the amplifier of a voice that was not struck. *Address line* and *Data line* cut the wires between the step counter and the pattern memory: the counter keeps counting, the memory returns the wrong steps, and the machine plays a pattern that differs from the one in the grid.',
  },
  {
    tap: 'fmChip',
    name: 'Glint',
    kind: 'FM synth',
    stem: 'fm',
    levels: ['fmLevel'],
    mute: 'fmMute',
    supply: 'fmSupply',
    keybed: 'fm',
    keyGate: 'fmKeyGate',
    struck: 'fmStruck',
    cv: 'fmClock',
    mic: [
      {
        jack: 'glintBus',
        name: 'Glint bus',
        part: 'data bus',
        says: 'your voice overwrites its settings, and they stay overwritten',
      },
    ],
    map: 'top',
    face: true,
    blurb:
      'The board’s FM synthesiser: two operators a voice, four voices, on the same rail. It has no sequencer: its key input is soldered onto the toy’s gate line, so out of the box it plays whatever strikes a note there. *Struck by* also clips the kit’s trigger lines on, and *Follows toy* cuts the gate jumper (it then reads *own keys only*), so Glint plays only from the keybed on its board. Once the chip is up in the mix, the panel draws that keybed under the toy’s, with a hold and octave for each, and the *keys* switch on either deck sets which of the two the computer’s letter keys play. A processor configures Glint a byte at a time over a bus, and *Data line* and *Address line* cut that bus: a byte that lands wrong stays wrong until the processor writes that register again, and if the wire carrying the key back up cannot go low, the note never ends. *Wave line* cuts the other bus, which the processor never touches. Glint looks its sine up in a table by address, so a fault on that bus reshapes the wave as you play, and the wave is whole again as soon as the fault clears. *Effect* plays a bird, surf, wind, a siren or crickets from the ROM. Each effect is a program of register writes, and these programs write to the bus more often than anything else does. The effect buttons over the keys run any of them while held.',
  },
  {
    tap: 'pcmKeys',
    name: 'Parlor',
    kind: 'home keyboard',
    stem: 'keys',
    levels: ['pcmLevel'],
    mute: 'pcmMute',
    supply: 'pcmSupply',
    keybed: 'pcm',
    keyGate: 'pcmKeyGate',
    struck: 'pcmStruck',
    cv: 'pcmLevel',
    map: 'top',
    face: true,
    blurb:
      'An eight-bit sampling home keyboard, and the only machine on this board that makes pads, strings, choirs and bells. It has no oscillator: a ROM holds one short recording of each voice, an attack and then a loop, and a counter steps through that ROM at a rate set by the note. The ROM was cut at 9.9 kHz and the output is not interpolated, so every voice has its images over it, and *Tone*, a two-pole reconstruction filter, sets how much of that you hear. The rate is a twelve-bit divider, so the top octave comes out a few cents sharp and the bottom is in tune. *Address line* cuts the counter’s wires, so each word is real but read from the wrong place and a voice folds onto its first half or reads every sample twice. *Data line* cuts the wires out of the ROM; held high, the top wire folds the bottom half of every wave up onto the top of it. *Chord memory* puts a voicing under one key and fills all four voices with it. *sampled* plays whatever you dropped on the sampler across the keyboard, from a second and a half of memory, with the reel’s loop markers as its loop.',
  },
  {
    tap: 'monoSynth',
    name: 'Growler',
    kind: 'mono synth',
    stem: 'mono',
    levels: ['monoLevel'],
    mute: 'monoMute',
    supply: 'monoSupply',
    keybed: 'mono',
    keyGate: 'monoKeyGate',
    struck: 'monoStruck',
    cv: 'monoPitch',
    mic: [
      {
        jack: 'growlerIn',
        name: 'Growler in',
        part: 'external input',
        says: 'hold a key and the filter and envelope open on your voice',
      },
    ],
    map: 'under',
    face: true,
    blurb:
      'A three-oscillator monosynth voice card after the Model D, soldered onto the toy’s supply and gate line. It has three band-limited oscillators with hard sync and a sweep for osc 2, a mixer with noise and the output looped back in, and a four-pole transistor ladder filter that saturates and self-oscillates. It also has two contour generators, glide, and osc 3 as a modulator at audio rate or below. Out of the box the toy’s tune plays it two octaves down; *Gate* sets how long each struck note stays down, and at 1 the tune plays legato and slides. *Struck by* clips the kit’s trigger lines on, so a kick can restart the bass. The voice card has these faults: a converter with no heater, a VCA that leaks, oversized contour caps, a mismatched ladder pair, a drooping pitch hold, a stuck bit on the key DAC, a weak regulator, an untrimmed VCA that thumps and a ladder input pair that folds. The melody memory has faults of its own under *memory faults*: address and data lines, a counter whose carry is cut, a write enable that leaks each note into the next step, and a starved refresh that leaks a bit at a time. The last two change what the memory holds, and *restore* on the roll writes the line back.',
  },
  {
    tap: 'chaosOsc',
    name: 'Chaos osc',
    kind: 'oscillator',
    stem: 'chaos',
    levels: ['oscLevel'],
    mic: [
      {
        jack: 'oscSync',
        name: 'osc sync',
        part: 'sync input',
        says: 'each cycle of your voice restarts oscillator A, so it follows your pitch',
      },
      {
        jack: 'oscFm',
        name: 'osc FM',
        part: 'FM input',
        says: 'your voice bends oscillator A’s pitch',
      },
    ],
    map: 'line',
    blurb:
      'Two oscillators share one starving supply: B modulates A’s frequency, the output current drains the rail, the rail modulates pitch and amplitude, and the stall-and-recover cycle motorboats without any input.',
  },
  {
    tap: 'noise',
    name: 'Noise & crackle',
    kind: 'noise source',
    stem: 'noise',
    levels: ['noiseLevel', 'crackleAmp'],
    map: 'line',
    blurb:
      'Hiss with a colour control, and sparse crackle with a rate control.',
  },
  {
    tap: 'sampler',
    name: 'Spool',
    kind: 'tape loop',
    stem: 'tape-loop',
    levels: ['sampleLevel'],
    yours: true,
    mic: [
      {
        jack: 'tapeMotor',
        name: 'tape motor',
        part: 'capstan motor',
        says: 'the tape runs as fast as you are loud and stops in silence',
      },
    ],
    map: 'line',
    face: true,
    blurb:
      'A loaded audio file, looping through the chain. With *Struck by* on a voice and *Ending* on one-shot, it plays whatever you dropped as a seventh drum voice. A bay wire can connect to the reel’s capstan and both loop markers, so it can shift the reel’s pitch as a starve shifts the toy’s, or move the loop window around the recording while the head plays on.',
  },
  {
    tap: 'fourTrack',
    name: 'Layercake',
    kind: 'four-track',
    stem: 'four-track',
    levels: ['fourLevel'],
    yours: true,
    map: 'line',
    face: true,
    blurb:
      'A cassette four-track: a desk of four channel strips, each with knobs and a fader, in front of four tape loops, each cut to a separate length and all on one capstan. A channel takes its input from its loop, the board, the mic or the desk’s aux return, passes it through a trim preamp and three bands of EQ into a fader and an aux send, and records onto its loop over whatever the erase head left. With input on the board and a loop recording, the signal loops round the whole board, so each lap comes back through every bend again. With input on the aux and its send up, the desk is a mixer with nothing plugged in: the sweepable mid tunes the squeal and the op-amp rails clip it. *Wear* sheds oxide at the same places every lap, and *Batteries* lowers the motor and the rails together.',
  },
  {
    tap: 'sheet',
    name: 'Sheet',
    kind: 'struck metal',
    stem: 'sheet',
    levels: ['sheetLevel'],
    map: 'line',
    face: true,
    blurb:
      'A big steel sheet with two contact mics on it. Click its face to hit it where you click; things also strike it at random, or a kit voice or a key does, and a hit sometimes bounces. The board’s own sound shakes it so it hums along, and turned well up it hears itself and howls. A loud sheet rattles against what it lies on. Hold runs from lying on a floor to hung from a corner.',
  },
  {
    tap: 'bottle',
    name: 'Bottle',
    kind: 'glass bottle',
    stem: 'bottle',
    levels: ['bottleLevel'],
    map: 'line',
    face: true,
    blurb:
      'A glass bottle on a table with a contact mic taped to its side. Click its face to tap it where you click: across is round the bottle, down is along it. Things also tap it at random, or a kit voice or a key does. Fill pours water in, lower and duller the fuller it is. Shake lets the board’s own sound sing in the glass, and turned well up it howls.',
  },
  {
    tap: 'leadSynth',
    name: 'Howler',
    kind: 'lead synth',
    stem: 'lead',
    levels: ['leadLevel'],
    mute: 'leadMute',
    supply: 'leadSupply',
    keybed: 'lead',
    keyGate: 'leadKeyGate',
    struck: 'leadStruck',
    cv: 'leadPitch',
    mic: [
      {
        jack: 'howlerIn',
        name: 'Howler in',
        part: 'external input',
        says: 'a scream into the lead rings the ladder and folds with it',
      },
    ],
    map: 'under',
    face: true,
    blurb:
      "A second build of Growler’s card, voiced as a lead: 8′, osc 2 hard-synced and swept by the filter contour, the ladder near oscillation and its folding pair partly in, with a short gate and a hard accent. It has a 32-step melody memory of its own, kit-synced like Growler’s, so a lead plays over the bassline, with the same *memory faults* as Growler’s and wired apart from them. `bender.line(notes, { on: 'Howler' })` writes it, and *lead split* on the MIDI menu plays Growler under the split and Howler over it.",
  },
  {
    tap: 'prattle',
    name: 'Prattle',
    kind: 'speech chip',
    stem: 'prattle',
    levels: ['talkLevel'],
    mute: 'talkMute',
    supply: 'talkSupply',
    struck: 'talkStruck',
    cv: 'talkLevel',
    mic: [
      {
        jack: 'prattleIn',
        name: 'Prattle in',
        part: 'the mouth',
        says: 'your voice replaces the chip’s buzz and hiss, so it speaks through Prattle’s mouth',
      },
    ],
    map: 'under',
    blurb:
      "A talking toy's speech chip: a ten-stage lattice filter excited by a glottal pulse off a pitch divider or by a noise register, reading 54 allophones from ROM, each a run of frames of energy, pitch and ten quantised reflection coefficients worked out from formant targets. One RC clock runs the samples, the pitch and the frames. Type a phrase or click words into its box; numbers and techno words come from a dictionary and the rest is sounded out. *Struck by* speaks a syllable per kit hit, so words land on the grid, and *Frame clock from* can run the frames off the kit's counter. Faults: the RC clock, a frame divider that smears or stops on one vowel, a cut carry that loops the frame counter into a stutter, the coefficient ROM's address and data wires (D10 and D11 push a coefficient past one and the lattice howls into its saturating adders), the pitch latch, a stuck voicing gate and the board leaking onto the excitation. *Prattle in* puts the mic in place of the buzz. `bender.speak('kill the bass')` sets the words.",
  },
] as const satisfies readonly MachineSpec[]

export type Machine = (typeof MACHINES)[number]
export type MachineName = Machine['name']
export type SourceTap = Machine['tap']
export type NoteDest = Extract<Machine, { keybed: string }>['keybed']

/** The machines on the toy board, inside its frame and on its rail. */
export type BoardMachine = Exclude<Machine, { map: 'line' }>['name']

export const machineNamed = (name: string) =>
  MACHINES.find(m => m.name === name)

/** The keybeds, the toy's first, in the order the worklet reports them. */
export const KEYBEDS = MACHINES.flatMap(m => ('keybed' in m ? [m.keybed] : []))

/** A record with an entry for every item, under the key it names, which
    Object.fromEntries builds but cannot type. */
export function recordOf<T, K extends string, V>(
  items: readonly T[],
  key: (item: T) => K,
  value: (item: T) => V,
): Record<K, V>
export function recordOf<T>(
  items: readonly T[],
  key: (item: T) => string,
  value: (item: T) => unknown,
) {
  return Object.fromEntries(items.map(t => [key(t), value(t)]))
}

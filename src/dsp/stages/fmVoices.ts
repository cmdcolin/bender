// The FM chip's register map and the voice table the CPU sends it, laid out the
// way the part's datasheet did.
//
// The map matters as much as the sound. A register file is what the bend has to
// bite on: which byte lands where decides whether a wire held low costs you a
// harmonic, an octave, or the note ending. Two of these are the same register on
// purpose — the top bit of the frequency shares a byte with the key going down,
// because the part had eight data lines and nine bits of frequency to fit in
// them, and that is exactly the crowding that makes one cut wire move the pitch
// and the note's existence together.
export const REG = {
  /** modulator: sustained-envelope bit, and the frequency multiplier */
  modFlags: 0x00,
  carFlags: 0x01,
  /** how loud the modulator is into the carrier, as attenuation */
  modLevel: 0x02,
  /** feedback depth, and which operators run on half a sine */
  feedback: 0x03,
  /** attack in the high nibble, decay in the low */
  modAttack: 0x04,
  carAttack: 0x05,
  /** sustain level in the high nibble, release in the low */
  modSustain: 0x06,
  carSustain: 0x07,
  /** the percussion bank: the mode bit and a key per drum, see RHY */
  rhythm: 0x0e,
  /** the one the driver only ever writes zero to: see TEST */
  test: 0x0f,
  /** per channel from here down */
  fnumLo: 0x10,
  keyBlock: 0x20,
  instVol: 0x30,
} as const

// The test register, which the part has and the datasheet does not. It sits in
// the gap above the patch bytes, the factory used it to check the die, and the
// only time a driver goes near it is the write that clears it at power-on —
// every driver for this part sends that write, because a chip that came up with
// a test bit set would be a chip that never sounded right.
//
// That one write is the whole of the bend. It is a byte on the same bus as
// every other, so a data line held high sets a bit in it that nothing was ever
// meant to set, and the clear that should undo it crosses the same broken wire.
// Nothing else on the chip persists like this: a corrupted patch byte is
// overwritten the next time a knob moves, and a corrupted test byte is
// overwritten by another corrupted test byte.
//
// Four switches, and none of them is a sound the register file can make. They
// are not levels or rates — they are the counters and the latch themselves.
export const TEST = {
  /** every operator wide open, whatever its attenuation says: the envelopes
      stop being envelopes and the keys become a gate */
  envMax: 0x01,
  /** the envelope counter forced to its fastest step, so every note in every
      patch collapses to the same four-millisecond click */
  envRace: 0x02,
  /** the output latch takes every other slot and holds through the one it
      missed, which is half the sample rate and all of the aliasing */
  dacSkew: 0x04,
  /** the latch's sign line held, so what reaches the pin is rectified */
  dacSign: 0x08,
} as const

// The percussion bank, in the register the datasheet gives half a page to and
// the driver never touches unless the rhythm button is down.
//
// It is not a mode the sound passes through. It is the die handing hardware
// over: set the top bit here and the last two channels stop belonging to the
// keyboard, their operators re-tapped onto a kit held in ROM and keyed from the
// low bits of this same byte instead of from the key registers. Two of those
// operators stop reading the sine table altogether and take a shift register
// instead — free-running since power-on, and the only noise anywhere on this
// chip. Everything else it can make is a sine or a sum of them, which is why
// nothing the knife finds on a chip in melody mode ever comes out as hiss.
//
// Being one byte is what makes it worth bending. The mode and all three keys
// cross the data bus together, so a wire held high is a drum that never lifts,
// and a wire held low is a rhythm button that does nothing.
export const RHY = {
  /** the mode bit: the top channels change hands */
  on: 0x20,
  /** and the keys, one per drum, in the order the die assigns them */
  bass: 0x10,
  snare: 0x08,
  hat: 0x01,
} as const

// Envelope rates, four bits each. They live here rather than in the chip
// because the panel names its decay choices in milliseconds and has to count
// them off the same table the operators do.
export const attackSecs = (r: number) => 0.0005 * Math.pow(2, (15 - r) * 0.6)
export const fallSecs = (r: number) => 0.004 * Math.pow(2, (15 - r) * 0.62)

// The multiplier table, as the part shipped it: not a scale, and not even
// monotonic at the top, because the last few entries repeat. A voice's ratio is
// an index into this and nothing else — there is no detune on the chip and no
// fine anywhere, so two operators are either in a whole-number ratio or they
// are the same note.
export const MULT = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15]

/** The key going down, in the register it shares with the top of the frequency. */
export const KEY_ON = 0x10

/** The sustained-envelope bit: set, the note waits for the key to come up. */
const HOLD = 0x20
/** The waveform bits in the shape byte. */
export const CAR_HALF = 0x08
export const MOD_HALF = 0x10

export interface Voice {
  name: string
  /** frequency multiplier index for each operator, into the part's own table */
  modMult: number
  carMult: number
  /** true where the note holds until the key comes up */
  hold: boolean
  /** modulator attenuation, 0 loudest and 63 silent — the brightness of it */
  level: number
  feedback: number
  half: number
  /** attack and decay, 15 fastest */
  modAd: [number, number]
  carAd: [number, number]
  /** sustain level as attenuation, and release */
  modSr: [number, number]
  carSr: [number, number]
}

const nibbles = ([hi, lo]: [number, number]) => (hi << 4) | lo

/** A patch as the eight bytes the CPU actually sends. */
export const pack = (v: Omit<Voice, 'name'>) => [
  (v.hold ? HOLD : 0) | v.modMult,
  (v.hold ? HOLD : 0) | v.carMult,
  v.level,
  v.half | v.feedback,
  nibbles(v.modAd),
  nibbles(v.carAd),
  nibbles(v.modSr),
  nibbles(v.carSr),
]

// Eight patches, which is about what the cheap ones put under the voice buttons.
export const FM_VOICES: Voice[] = [
  {
    name: 'organ',
    modMult: 1,
    carMult: 1,
    hold: true,
    level: 20,
    feedback: 0,
    half: 0,
    modAd: [15, 4],
    carAd: [15, 4],
    modSr: [0, 7],
    carSr: [0, 7],
  },
  {
    name: 'brass',
    modMult: 1,
    carMult: 1,
    hold: true,
    level: 24,
    feedback: 4,
    half: 0,
    modAd: [12, 5],
    carAd: [12, 4],
    modSr: [2, 7],
    carSr: [2, 7],
  },
  {
    name: 'e.piano',
    modMult: 1,
    carMult: 1,
    hold: false,
    level: 28,
    feedback: 2,
    half: CAR_HALF,
    modAd: [15, 3],
    carAd: [15, 2],
    modSr: [3, 5],
    carSr: [2, 4],
  },
  {
    name: 'bell',
    modMult: 7,
    carMult: 1,
    hold: false,
    level: 30,
    feedback: 0,
    half: 0,
    modAd: [15, 2],
    carAd: [15, 1],
    modSr: [5, 3],
    carSr: [1, 1],
  },
  {
    name: 'clarinet',
    modMult: 2,
    carMult: 1,
    hold: true,
    level: 26,
    feedback: 0,
    half: MOD_HALF,
    modAd: [14, 6],
    carAd: [13, 4],
    modSr: [1, 7],
    carSr: [2, 7],
  },
  {
    name: 'bass',
    modMult: 1,
    carMult: 1,
    hold: false,
    level: 22,
    feedback: 5,
    half: 0,
    modAd: [15, 6],
    carAd: [15, 4],
    modSr: [4, 3],
    carSr: [2, 3],
  },
  {
    name: 'strings',
    modMult: 1,
    carMult: 1,
    hold: true,
    level: 32,
    feedback: 1,
    half: 0,
    modAd: [7, 6],
    carAd: [6, 4],
    modSr: [1, 7],
    carSr: [1, 7],
  },
  {
    name: 'marimba',
    modMult: 4,
    carMult: 1,
    hold: false,
    level: 24,
    feedback: 0,
    half: 0,
    modAd: [15, 5],
    carAd: [15, 3],
    modSr: [3, 3],
    carSr: [1, 3],
  },
]

export const PATCH_BYTES = FM_VOICES.map(pack)

// The kit the die keeps in ROM. The bass drum is the only one of the three
// still running off the sine table, so it is the only one that needs a patch —
// and because it lives in ROM rather than in the register file, nothing the
// knife does to the patch bytes reaches it. What the knife reaches on these
// channels is the keys, the mode, the tuning and the volume nibbles.
export const KIT = {
  bass: pack({
    modMult: 1,
    carMult: 1,
    hold: false,
    level: 16,
    feedback: 7,
    half: 0,
    modAd: [15, 9],
    carAd: [15, 7],
    modSr: [0, 9],
    carSr: [0, 7],
  }),
  // The two noise slots need a pair of rates each and nothing else: there is no
  // patch to give an operator that has been cut off from the table.
  snare: { ad: nibbles([15, 11]), sr: nibbles([0, 11]) },
  hat: { ad: nibbles([15, 13]), sr: nibbles([0, 13]) },
}

/** Where the die keys the bass drum: not a note anybody chose, but nine bits of
    frequency and a block fixed in ROM, an octave under the keyboard's bottom.
    They go out through the frequency registers like any other note, so this is
    the one part of the kit a knife on the bus can still retune. */
export const BASS_FNUM = 268
export const BASS_BLOCK = 1
export const FM_VOICE_NAMES = FM_VOICES.map(v => v.name)

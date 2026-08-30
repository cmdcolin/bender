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
  /** modulator: the two LFO bits, sustained envelope, rate scaling, multiplier */
  modFlags: 0x00,
  carFlags: 0x01,
  /** the modulator's key scaling, and how loud it is into the carrier */
  modLevel: 0x02,
  /** the carrier's key scaling, which operators run on half a sine, feedback */
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
  /** which instrument in the high nibble, how loud in the low */
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

/** The key going down, in the register it shares with the top of the frequency. */
export const KEY_ON = 0x10

/** The sustained-envelope bit: set, the note waits for the key to come up. */
const HOLD = 0x20
/** The waveform bits in the shape byte. */
export const CAR_HALF = 0x08
export const MOD_HALF = 0x10

// The top of the flags byte, where the die keeps the two bits that do not
// belong to the operator at all.
//
// One LFO serves the whole part — a counter off the same divider as everything
// else, running since power-on, with no register anywhere to start it, stop it
// or set its rate. All either bit decides is whether this operator is wired to
// it. Which is what makes them worth their place up here: every other bit in
// the register file describes the operator it sits in, and these two connect it
// to something shared, so a wire that sets one sets it in every patch byte the
// processor sends and the whole chip starts breathing together.
export const AM = 0x80
export const VIB = 0x40
/** Rate scaling: set, the envelope counts faster the higher the note sits. */
export const KSR = 0x10

/** The key-scaling field, two bits at the top of a level byte. */
export const KSL_SHIFT = 6
/** How fast attenuation climbs with the octave, per setting, in dB. */
export const KSL_DB = [0, 1.5, 3, 6]

// Which operator a voice means, for the bits a patch sets on one and not the
// other. AM and VIB sit at the same place in two different registers, so a mask
// is the only way to write a patch down without writing the bytes out twice.
export const MOD_OP = 1
export const CAR_OP = 2

// Envelope rates, four bits each. They live here rather than in the chip
// because the panel names its decay choices in milliseconds and has to count
// them off the same table the operators do.
export const attackSecs = (r: number) => 0.0005 * Math.pow(2, (15 - r) * 0.6)
export const fallSecs = (r: number) => 0.004 * Math.pow(2, (15 - r) * 0.62)

// The key-scale number: how high the note sits, in the only terms the die has
// for it. It is the low nibble of the key register exactly as it stands — the
// octave and the top bit of the count, which are the four wires the scaling
// hardware is soldered to. Nothing computes it.
export const keyScaleNum = (key: number) => key & 0x0f

/** The rate an operator counts at, once its octave has had a say. */
export const scaledRate = (rate: number, key: number, flags: number) =>
  flags & KSR ? Math.min(rate + (keyScaleNum(key) >> 1), 15) : rate

// Key-scale level, as a gain rather than as the decibels the die counts in.
// The part attenuates by octave: a patch with this set gives up level the
// higher it is played, which is how one set of eight bytes covers a keyboard
// instead of turning into a shriek at the top.
//
// A table because the alternative is a logarithm per operator per sample. Every
// input is already a handful of bits off two registers — two of setting, three
// of octave, four off the top of the count — so the whole space is 512 entries
// and the lookup is the address those bits already spell.
const KSL_GAIN = (() => {
  const g = new Float64Array(4 << 7)
  for (let ksl = 0; ksl < 4; ksl++)
    for (let block = 0; block < 8; block++)
      for (let top = 0; top < 16; top++) {
        const octaves = block + Math.log2(Math.max(top, 1) / 16)
        const db = KSL_DB[ksl]! * Math.max(octaves, 0)
        g[(ksl << 7) | (block << 4) | top] = Math.pow(10, -db / 20)
      }
  return g
})()

/** What key scaling leaves of an operator, off the two registers holding it. */
export const kslGain = (ksl: number, block: number, fnum: number) =>
  KSL_GAIN[(ksl << 7) | (block << 4) | (fnum >> 5)]!

// The multiplier table, as the part shipped it: not a scale, and not even
// monotonic at the top, because the last few entries repeat. A voice's ratio is
// an index into this and nothing else — there is no detune on the chip and no
// fine anywhere, so two operators are either in a whole-number ratio or they
// are the same note.
export const MULT = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15]

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
  /** which operators the die's one LFO is wired to */
  am?: number
  vib?: number
  /** whether the envelope counts faster the higher the note sits */
  ksr?: boolean
  /** how fast each operator gives up level as the note climbs, 0 to 3 */
  modKsl?: number
  carKsl?: number
  /** attack and decay, 15 fastest */
  modAd: [number, number]
  carAd: [number, number]
  /** sustain level as attenuation, and release */
  modSr: [number, number]
  carSr: [number, number]
}

const nibbles = ([hi, lo]: [number, number]) => (hi << 4) | lo

const flags = (v: Omit<Voice, 'name'>, op: number, mult: number) =>
  ((v.am ?? 0) & op ? AM : 0) |
  ((v.vib ?? 0) & op ? VIB : 0) |
  (v.hold ? HOLD : 0) |
  (v.ksr ? KSR : 0) |
  mult

/** A patch as the eight bytes the CPU actually sends. */
export const pack = (v: Omit<Voice, 'name'>) => [
  flags(v, MOD_OP, v.modMult),
  flags(v, CAR_OP, v.carMult),
  ((v.modKsl ?? 0) << KSL_SHIFT) | v.level,
  ((v.carKsl ?? 0) << KSL_SHIFT) | v.half | v.feedback,
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
    carKsl: 2,
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
    ksr: true,
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
    vib: MOD_OP | CAR_OP,
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
    carKsl: 2,
    ksr: true,
    modAd: [15, 5],
    carAd: [15, 3],
    modSr: [3, 3],
    carSr: [1, 3],
  },
]

// The rest of what the die holds. A part like this ships with fifteen patches
// burned into it and a keyboard puts as many of them under buttons as it has
// room for — eight here, so seven of the chip's own sounds are on the board and
// wired to nothing. There is no button that reaches them and no register the
// processor writes to ask for them: the instrument nibble is one it always
// sends as zero, because zero is the patch it just spent eight writes sending.
//
// Which makes them the one thing on this chip a knife *adds*. Every other fault
// takes a sound the board can already make and damages it; a wire under the top
// of the volume register hands you an instrument the keyboard has no way to
// play.
const ROM_ONLY: Voice[] = [
  {
    name: 'violin',
    modMult: 1,
    carMult: 1,
    hold: true,
    level: 27,
    feedback: 2,
    half: 0,
    vib: MOD_OP | CAR_OP,
    modKsl: 1,
    modAd: [8, 5],
    carAd: [7, 3],
    modSr: [1, 6],
    carSr: [1, 6],
  },
  {
    name: 'flute',
    modMult: 1,
    carMult: 1,
    hold: true,
    level: 38,
    feedback: 0,
    half: 0,
    vib: CAR_OP,
    carKsl: 1,
    modAd: [11, 4],
    carAd: [10, 2],
    modSr: [0, 8],
    carSr: [0, 8],
  },
  {
    name: 'oboe',
    modMult: 3,
    carMult: 1,
    hold: true,
    level: 24,
    feedback: 1,
    half: MOD_HALF,
    ksr: true,
    modKsl: 1,
    modAd: [13, 5],
    carAd: [12, 3],
    modSr: [2, 7],
    carSr: [2, 7],
  },
  {
    name: 'trumpet',
    modMult: 1,
    carMult: 1,
    hold: true,
    level: 21,
    feedback: 6,
    half: 0,
    am: MOD_OP,
    carKsl: 1,
    modAd: [12, 6],
    carAd: [11, 4],
    modSr: [3, 6],
    carSr: [2, 6],
  },
  {
    name: 'horn',
    modMult: 1,
    carMult: 1,
    hold: true,
    level: 30,
    feedback: 3,
    half: 0,
    am: CAR_OP,
    vib: MOD_OP,
    modKsl: 2,
    modAd: [9, 4],
    carAd: [8, 3],
    modSr: [2, 7],
    carSr: [1, 7],
  },
  {
    name: 'harpsichord',
    modMult: 3,
    carMult: 1,
    hold: false,
    level: 23,
    feedback: 4,
    half: CAR_HALF,
    ksr: true,
    carKsl: 3,
    modAd: [15, 6],
    carAd: [15, 4],
    modSr: [4, 6],
    carSr: [2, 5],
  },
  {
    name: 'vibraphone',
    modMult: 4,
    carMult: 1,
    hold: false,
    level: 29,
    feedback: 0,
    half: 0,
    am: MOD_OP | CAR_OP,
    carKsl: 2,
    modAd: [15, 3],
    carAd: [15, 2],
    modSr: [2, 2],
    carSr: [0, 2],
  },
]

export const PATCH_BYTES = FM_VOICES.map(pack)

// The die's own bank, as the instrument nibble numbers it: the eight the panel
// has buttons for, then the seven it does not. Fifteen, because the nibble has
// a code left over for zero and zero is the patch in the register file.
export const ROM_VOICES: Voice[] = [...FM_VOICES, ...ROM_ONLY]
export const ROM_PATCH_BYTES = ROM_VOICES.map(pack)
export const ROM_VOICE_NAMES = ROM_VOICES.map(v => v.name)

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
/** What the vibrato button steps through, which is which bits it sets. */
export const FM_LFO_NAMES = ['off', 'vibrato', 'tremolo', 'both']

export const BASS_FNUM = 268
export const BASS_BLOCK = 1
export const FM_VOICE_NAMES = FM_VOICES.map(v => v.name)

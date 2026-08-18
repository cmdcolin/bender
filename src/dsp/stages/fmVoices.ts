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
  /** per channel from here down */
  fnumLo: 0x10,
  keyBlock: 0x20,
  instVol: 0x30,
} as const

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
export const FM_VOICE_NAMES = FM_VOICES.map(v => v.name)

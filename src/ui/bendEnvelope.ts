/** How a held bend key moves into its push and back out: attack, decay to a
    sustain, release, all in seconds. `curve` bends the attack, and 3 saves most
    of the climb for the end. `wobble` pulses the hold that many times a second. */
export interface Envelope {
  attack: number
  decay: number
  sustain: number
  release: number
  curve: number
  wobble: number
}

export const BEND_ENVELOPES = [
  'snap',
  'swell',
  'riser',
  'pluck',
  'wobble',
] as const
export type BendEnvelopeName = (typeof BEND_ENVELOPES)[number]

export const isBendEnvelope = (v: unknown): v is BendEnvelopeName =>
  BEND_ENVELOPES.some(n => n === v)

export const ENVELOPE_TIP: Record<BendEnvelopeName, string> = {
  snap: 'a key lands at once and lets go at once',
  swell: 'a key swells in over the morph time and falls back over the same',
  riser:
    'a key climbs over four bars of the kit, slowly and then all at once, and drops the moment you let go — hold it through the build, let go on the one',
  pluck:
    'a key hits hard, sinks to a fifth of its push over two beats, and falls away over one',
  wobble:
    'a key swells in over a bar, then pulses on every eighth for as long as you hold it',
}

const SNAP: Envelope = {
  attack: 0,
  decay: 0,
  sustain: 1,
  release: 0,
  curve: 1,
  wobble: 0,
}

/** The named envelope at the kit's beat, `beat` seconds long. Swell keeps the
    morph time it always had, with a second at least. */
export function bendEnvelope(
  name: BendEnvelopeName,
  beat: number,
  morph: number,
): Envelope {
  switch (name) {
    case 'swell': {
      const s = Math.max(morph, 1)
      return { ...SNAP, attack: s, release: s }
    }
    case 'riser':
      return { ...SNAP, attack: 16 * beat, curve: 3 }
    case 'pluck':
      return { ...SNAP, decay: 2 * beat, sustain: 0.2, release: beat }
    case 'wobble':
      return { ...SNAP, attack: 4 * beat, release: 2 * beat, wobble: 2 / beat }
    default:
      return SNAP
  }
}

/** How far into its push a key stands `t` seconds after it went down, 0 to 1. */
export function heldLevel(e: Envelope, t: number): number {
  let v = e.sustain
  if (t < e.attack) v = (t / e.attack) ** e.curve
  else if (t < e.attack + e.decay)
    v = 1 - ((1 - e.sustain) * (t - e.attack)) / e.decay
  if (e.wobble > 0) v *= 0.6 + 0.4 * Math.cos(2 * Math.PI * e.wobble * t)
  return v
}

/** The moment in the attack that stands at `level`, so a key pressed again on
    its way out climbs on from where it had fallen to. */
export const attackFrom = (e: Envelope, level: number) =>
  e.attack * Math.min(Math.max(level, 0), 1) ** (1 / e.curve)

/** When a held key stops moving, or Infinity for one that never does. */
export const settles = (e: Envelope) =>
  e.wobble > 0 ? Infinity : e.attack + e.decay

/** How far into its push a key stands `t` seconds after it was let go from
    `from`, or null once it is all the way out. */
export function releasedLevel(
  e: Envelope,
  from: number,
  t: number,
): number | null {
  if (t >= e.release) return null
  return from * (1 - t / e.release)
}

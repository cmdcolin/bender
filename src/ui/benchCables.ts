import { N_DRUM_VOICES, VOICE_LABELS } from '../drums.ts'
import {
  connectionInto,
  MACHINE_OF,
  PLINKY_TO_KIT,
  SIGNAL_COLOUR,
  type Connection,
} from './connections.ts'
import {
  ADSR,
  cableSays,
  CV_MACHINES,
  cvFacing,
  LFO,
  MOD_COLOUR,
  modCables,
  moveCv,
  patchCv,
  pullCv,
  sourcesInUse,
} from './modCables.ts'

import type { ControlKey, Controls } from '../controls.ts'
import type { NoteDest } from '../engine/messages.ts'
import type { Facing } from './cablePaths.ts'

// Every cable on the bench is one of three lines, and each line is the same
// machine: outputs any number of cables stack on, inputs that hold theirs, and
// a control on the board that says which output each input holds.

export const LINES = ['gate', 'trig', 'mod'] as const
export type Line = (typeof LINES)[number]
export type Side = 'in' | 'out'

export interface End {
  line: Line
  side: Side
  id: string
}

export interface Cable {
  line: Line
  id: string
  out: string
  in: string
}

export const jackKey = ({ line, side, id }: End) => `${line}:${side}:${id}`
export const cableKey = (x: Cable) => `${x.line}:${x.id}`
export const outEnd = (x: Cable): End => ({
  line: x.line,
  side: 'out',
  id: x.out,
})
export const inEnd = (x: Cable): End => ({ line: x.line, side: 'in', id: x.in })

export function endOf(key: string | undefined): End | null {
  const [line, side, id] = key?.split(':') ?? []
  const l = LINES.find(each => each === line)
  return l && (side === 'in' || side === 'out') && id
    ? { line: l, side, id }
    : null
}

/** A machine whose GATE jack takes Plinky's notes. */
export type Taker = Exclude<NoteDest, 'toy'> | 'kit'
const GATE_TAKERS: readonly Taker[] = ['fm', 'pcm', 'mono', 'kit']

export const gateInto = (taker: Taker): Connection =>
  taker === 'kit' ? PLINKY_TO_KIT : connectionInto(MACHINE_OF[taker], 'notes')!

/** A TRIG input: a keyboard's, or the ADSR's gate on the MOD plate. */
export type TrigTaker = NoteDest | 'adsr'
const TRIG_TAKERS: readonly TrigTaker[] = ['toy', 'fm', 'pcm', 'mono', 'adsr']

const trigControl = (taker: TrigTaker): ControlKey =>
  taker === 'adsr'
    ? 'modEnvGate'
    : connectionInto(MACHINE_OF[taker], 'hits')!.key

export const ANY_HIT = N_DRUM_VOICES + 1

/** The kit voice in a TRIG input, from its control. The ADSR's gate counts
    keys as 0, any hit as 1 and the voices after. */
export function voiceIn(taker: TrigTaker, c: Controls) {
  const v = Math.round(c[trigControl(taker)])
  if (taker !== 'adsr' || v === 0) return v
  return v === 1 ? ANY_HIT : v - 1
}

function valueFor(taker: TrigTaker, voice: number) {
  if (taker !== 'adsr' || voice === 0) return voice
  return voice === ANY_HIT ? 1 : voice + 1
}

export const voiceName = (voice: number) =>
  voice === ANY_HIT ? 'any hit' : VOICE_LABELS[voice - 1]!

const PLATE_NAME: Record<string, string> = {
  'open hat': 'ohat',
  cymbal: 'cym',
  'any hit': 'any',
}

export const plateName = (voice: number) => {
  const name = voiceName(voice)
  return PLATE_NAME[name] ?? name
}

const NAMED: Record<string, string> = {
  toy: 'Plinky',
  fm: 'Glint',
  pcm: 'Parlor',
  mono: 'Growler',
  kit: 'the kit',
  adsr: 'the ADSR',
}

const asTaker = (id: string) => GATE_TAKERS.find(t => t === id)
const asTrigTaker = (id: string) => TRIG_TAKERS.find(t => t === id)
const asMachine = (id: string) => CV_MACHINES.find(m => m === id)

interface Kind {
  colour: string
  /** The legend on the inputs this line plugs into. */
  jack: string
  cables: (c: Controls) => Cable[]
  /** Whether the bench draws a cable. Every cable counts for the jacks. */
  shown?: (c: Controls, x: Cable) => boolean
  plug: (c: Controls, input: string, output: string) => Controls
  pull: (c: Controls, x: Cable) => Controls
  move: (c: Controls, x: Cable, input: string) => Controls
  /** The output an empty input takes when pressed. */
  fresh: string
  facing: (side: Side, id: string) => Facing
  says: (c: Controls, x: Cable) => string
}

function setGate(c: Controls, id: string, on: boolean): Controls {
  const t = asTaker(id)
  if (!t) return c
  const x = gateInto(t)
  return { ...c, [x.key]: on ? x.plugIn : x.pullOut }
}

function setTrig(c: Controls, id: string, voice: number): Controls {
  const t = asTrigTaker(id)
  return t ? { ...c, [trigControl(t)]: valueFor(t, voice) } : c
}

const gate: Kind = {
  colour: SIGNAL_COLOUR.notes,
  jack: 'GATE',
  cables: c =>
    GATE_TAKERS.filter(t => gateInto(t).plugged(c)).map(t => ({
      line: 'gate',
      id: t,
      out: 'plinky',
      in: t,
    })),
  plug: (c, input) => setGate(c, input, true),
  pull: (c, x) => setGate(c, x.in, false),
  move: (c, x, input) => setGate(setGate(c, x.in, false), input, true),
  fresh: 'plinky',
  facing: (side, id) => (side === 'in' && id === 'kit' ? 'up' : 'right'),
  says: (_, x) => `Plinky’s notes reach ${NAMED[x.in]}`,
}

const trig: Kind = {
  colour: SIGNAL_COLOUR.hits,
  jack: 'TRIG',
  cables: c =>
    TRIG_TAKERS.flatMap(t => {
      const v = voiceIn(t, c)
      return v > 0 ? [{ line: 'trig', id: t, out: String(v), in: t }] : []
    }),
  shown: (c, x) => x.in !== 'adsr' || sourcesInUse(c).has(ADSR),
  plug: (c, input, output) => setTrig(c, input, Number(output)),
  pull: (c, x) => setTrig(c, x.in, 0),
  move: (c, x, input) => setTrig(setTrig(c, x.in, 0), input, Number(x.out)),
  fresh: String(ANY_HIT),
  facing: (side, id) => (side === 'out' || id === 'adsr' ? 'up' : 'right'),
  says: (_, x) =>
    `The kit’s ${voiceName(Number(x.out))} line ${x.in === 'adsr' ? 'opens' : 'strikes'} ${NAMED[x.in]}`,
}

const mod: Kind = {
  colour: MOD_COLOUR,
  jack: 'CV',
  cables: c =>
    modCables(c).map(m => ({
      line: 'mod',
      id: String(m.wire),
      out: String(m.src),
      in: m.machine,
    })),
  plug: (c, input, output) => {
    const m = asMachine(input)
    return m ? patchCv(c, Number(output), m) : c
  },
  pull: (c, x) => pullCv(c, Number(x.id)),
  move: (c, x, input) => {
    const m = asMachine(input)
    return m ? moveCv(c, Number(x.id), m) : c
  },
  fresh: String(LFO),
  facing: (side, id) => {
    const m = asMachine(id)
    return side === 'out' ? 'up' : m ? cvFacing(m) : 'right'
  },
  says: (c, x) => {
    const m = modCables(c).find(w => String(w.wire) === x.id)
    return m ? cableSays(m) : ''
  },
}

export const KINDS: Record<Line, Kind> = { gate, trig, mod }

/** Every cable the bench draws. */
export const cablesOn = (c: Controls) =>
  LINES.flatMap(l =>
    KINDS[l].cables(c).filter(x => KINDS[l].shown?.(c, x) ?? true),
  )

export const lastInto = (c: Controls, end: End) =>
  KINDS[end.line].cables(c).findLast(x => x.in === end.id)

/** Whether a cable touches the jack at this end. */
export const touches = (c: Controls, end: End) =>
  KINDS[end.line]
    .cables(c)
    .some(x => (end.side === 'in' ? x.in : x.out) === end.id)

/** The board after a press on an input: its last cable pulled, or the line's
    usual output plugged into it while it is empty. */
export function pressed(c: Controls, end: End): Controls {
  const kind = KINDS[end.line]
  const last = lastInto(c, end)
  return last ? kind.pull(c, last) : kind.plug(c, end.id, kind.fresh)
}

/** The board after a cable lands: `carried` moved or pulled, or a fresh cable
    from `fixed` plugged into `landed`. */
export function dropped(
  c: Controls,
  fixed: End,
  carried: Cable | null,
  landed: End | null,
): Controls {
  const kind = KINDS[fixed.line]
  const onto =
    landed && landed.line === fixed.line && landed.side !== fixed.side
      ? landed
      : null
  if (carried) {
    if (onto?.id === carried.in) return c
    return onto ? kind.move(c, carried, onto.id) : kind.pull(c, carried)
  }
  if (!onto) return c
  return fixed.side === 'in'
    ? kind.plug(c, fixed.id, onto.id)
    : kind.plug(c, onto.id, fixed.id)
}

export function parseCables(shown: string): Cable[] {
  return shown
    .split(',')
    .filter(Boolean)
    .flatMap(s => {
      const [line, id, out, input] = s.split(':')
      const l = LINES.find(each => each === line)
      return l && id && out && input ? [{ line: l, id, out, in: input }] : []
    })
}

export const writeCables = (xs: readonly Cable[]) =>
  xs.map(x => [x.line, x.id, x.out, x.in].join(':')).join(',')

import { DEFAULT_CONTROLS, type ControlKey, type Controls } from '../controls'
import { choiceName, choiceValue } from './controls'

// The patch bay, from the far end: a control row asking whether the bay is on
// it, and putting a lead there when it isn't.
//
// The bay itself is four wires and a list of thirty-six places to land, and
// wiring the knob in front of you meant leaving the stage, finding a free wire,
// finding the lane's name in that list, and coming back to hear it. Every one
// of those steps is the same three writes this file does. Nothing here is a
// second bay — the wire it solders is one of the same four, draws in the same
// diagram, and rolls, saves and shares like any other.

const WIRES = [
  { src: 'mod0Src', dest: 'mod0Dest', depth: 'mod0Depth' },
  { src: 'mod1Src', dest: 'mod1Dest', depth: 'mod1Depth' },
  { src: 'mod2Src', dest: 'mod2Dest', depth: 'mod2Depth' },
  { src: 'mod3Src', dest: 'mod3Dest', depth: 'mod3Depth' },
] as const satisfies readonly Record<'src' | 'dest' | 'depth', ControlKey>[]

const SRC_OFF = choiceValue('mod0Src', 'off')
// What a wire soldered from a row picks up. The bay's own oscillator is the one
// source running on every board — a mic nobody has turned on, or a kit that is
// stopped, would hand back a wire that reads as patched and sits still.
const SRC_LFO = choiceValue('mod0Src', 'LFO')

// The lane that is each wire's own push rather than a stage, so no wire is ever
// soldered onto its own depth: that is the one patch in the bay that cannot do
// anything at all.
const OWN_DEPTH = WIRES.map((_, i) =>
  choiceValue('mod0Dest', `wire ${i + 1} depth`),
)

function soldered(c: Controls, dest: number) {
  for (const [at, w] of WIRES.entries())
    if (c[w.src] !== SRC_OFF && Math.round(c[w.dest]) === dest)
      return { at, ...w }
  return undefined
}

function spare(c: Controls, dest: number) {
  for (const [at, w] of WIRES.entries())
    if (c[w.src] === SRC_OFF && OWN_DEPTH[at] !== dest) return { at, ...w }
  return undefined
}

/** Which wire the bay has on this lane, counted as the panel counts them, or 0
    where it has none. */
export function laneWire(c: Controls, lane: string): number {
  const on = soldered(c, choiceValue('mod0Dest', lane))
  return on === undefined ? 0 : on.at + 1
}

/** The wire's own controls, for a row that wants to draw them under itself
    rather than send you to the bay for them. Nothing where the number is 0. */
export function wireKeys(wire: number) {
  return WIRES[wire - 1]
}

// A rate in the width of a badge. The bay's oscillator runs from a fiftieth of
// a hertz to four hundred, and neither end reads at the other's precision.
const hz = (rate: number) =>
  `${rate >= 10 ? Math.round(rate) : rate.toFixed(rate >= 1 ? 1 : 2)}Hz`

/** What is on the lane, in the width of a badge: what the wire picks up and how
    fast that is running. Empty where nothing is on it.

    A row used to read the same whether a slow sweep or a 200 Hz buzz was on it
    — it said that something was moving, and the only way to find out what was
    to go and open the bay, which is a trip to answer a question the row could
    answer by standing there. */
export function laneReads(c: Controls, lane: string): string {
  const on = soldered(c, choiceValue('mod0Dest', lane))
  if (on === undefined) return ''
  const src = choiceName('mod0Src', c[on.src])
  return src === 'LFO' ? `${src} ${hz(c.modLfoHz)}` : src
}

/** The same wire at tooltip length, where there is room for how hard it pushes
    and which way — the third of the three numbers that decide what a wobble
    does, and the one a badge has no width for. */
export function laneSays(c: Controls, lane: string): string {
  const on = soldered(c, choiceValue('mod0Dest', lane))
  if (on === undefined) return ''
  const depth = c[on.depth]
  return `${laneReads(c, lane)}, ${
    depth === 0
      ? 'at zero depth so far'
      : `pushing ${Math.abs(depth).toFixed(2)} ${depth < 0 ? 'flipped' : 'straight'}`
  }`
}

/** How many wires are picking the bay's oscillator up. One oscillator serves
    all four, so a row drawing its rate has to say when that rate is not its
    own business alone. */
export function bayLfoWires(c: Controls): number {
  return WIRES.filter(w => c[w.src] === SRC_LFO).length
}

/** Whether the bay has a lead left over for this lane. */
export function laneHasSpare(c: Controls, lane: string): boolean {
  return spare(c, choiceValue('mod0Dest', lane)) !== undefined
}

/** The board with the bay's first spare lead soldered onto this lane, off the
    LFO — or the board it was handed, where all four leads are already in use. */
export function solderLane(c: Controls, lane: string): Controls {
  const dest = choiceValue('mod0Dest', lane)
  const lead = spare(c, dest)
  const next = { ...c }
  if (lead !== undefined) {
    next[lead.src] = SRC_LFO
    next[lead.dest] = dest
    // A wire left at zero depth reads as patched and does nothing, which is the
    // one thing a button offering to set a control moving must not hand back.
    if (next[lead.depth] === 0) next[lead.depth] = DEFAULT_CONTROLS[lead.depth]
  }
  return next
}

/** The board with the wire on this lane unplugged. Where it landed and how hard
    it was pushing stay on the wire, so putting it back is the same press again
    rather than a depth to dial in for a second time. */
export function unsolderLane(c: Controls, lane: string): Controls {
  const lead = soldered(c, choiceValue('mod0Dest', lane))
  const next = { ...c }
  if (lead !== undefined) next[lead.src] = SRC_OFF
  return next
}

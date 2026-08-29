import type { ControlKey, Controls } from '../../controls'
import { DRUM_VOICES, N_DRUM_VOICES } from '../../drums'
import {
  BEND_SLOT_KEYS,
  bendAt,
  choiceValue,
  sliderFor,
  snapToStep,
} from '../controls'
import { fromPos } from '../slider-scale'
import { inTime } from './quantize'

// A patch bay rolled at random hands back four wires that read as a patch and
// mostly aren't one: a wire onto a reverb that is dry, one off a mic nobody has
// turned on, one onto a wire whose own source is unplugged. Every row of the
// panel says something is happening and nothing is. What this file knows is the
// two halves of what makes a wire audible — where it picks up and what it lands
// on — so a roll can pick both ends together, turn up the stage it landed on,
// and leave a bay where every lead does something you can hear.

const WIRES = [0, 1, 2, 3].map(i => ({
  src: `mod${i}Src` as ControlKey,
  dest: `mod${i}Dest` as ControlKey,
  depth: `mod${i}Depth` as ControlKey,
}))

const SRC_OFF = choiceValue('mod0Src', 'off')
const DEPTH_DEST = WIRES.map((_, i) =>
  choiceValue('mod0Dest', `wire ${i + 1} depth`),
)

/** Which wire this destination is the depth of, or −1 for a stage. */
const depthTarget = (dest: number) => DEPTH_DEST.indexOf(Math.round(dest))

const isUp = (c: Controls, key: ControlKey) => c[key] > sliderFor(key).min

const slotted = (c: Controls, label: string) =>
  BEND_SLOT_KEYS.some(k => bendAt(c[k])?.label === label)

// Where a wire can land, and what has to be up for landing there to be a sound
// rather than a row of text. `up` is everything that must be off its bottom
// stop; `oneOf` is a rail several machines share, where any one of them running
// is enough. A bend also has to be in a slot — a stage that isn't in the chain
// is not in the chain however wet its mix says it is.
//
// `hands` is a stage only you can bring in: there is no sample under the
// sampler until you fetch one, so a roll never lands a wire there cold, and
// never pulls one out of a bay you built on a reel you loaded.
interface Landing {
  dest: number
  up: ControlKey[]
  oneOf?: ControlKey[]
  bend?: string
  hands?: true
}

const at = (
  name: string,
  up: ControlKey[],
  rest: Omit<Landing, 'dest' | 'up'> = {},
): Landing => ({ dest: choiceValue('mod0Dest', name), up, ...rest })

const LANDINGS: Landing[] = [
  at('filt cut', ['filtMix'], { bend: 'filt' }),
  at('ring car', ['ringMix'], { bend: 'ring' }),
  at('comb pitch', ['combMix'], { bend: 'comb' }),
  at('crush rate', ['crushMix'], { bend: 'crush' }),
  at('bit depth', ['crushMix'], { bend: 'crush' }),
  at('glitch', ['glitchMix'], { bend: 'glitch' }),
  at('shift Hz', ['shiftMix'], { bend: 'shift' }),
  at('chip clock', ['chipLevel']),
  // The rail the whole toy runs off, so any of the three machines on it being
  // up is a wire there you can hear.
  at('starve', [], { oneOf: ['chipLevel', 'drumLevel', 'fmLevel'] }),
  at('drum tune', ['drumLevel']),
  // The retrigger is a multiplier on the rate you set: a wire onto a kit that
  // isn't retriggering multiplies zero.
  at('retrigger', ['drumLevel', 'drumRetrigHz']),
  // Same again for the cross-patch, which the kit reads as a switch: off, and
  // it never looks at the lane at all.
  at('drum cross', ['drumLevel', 'drumCross']),
  at('stomp drive', ['stompMix']),
  at('verb decay', ['revMix']),
  at('delay time', ['dlyMix']),
  at('tape speed', ['dlyMix']),
  at('echo time', ['echoLevel']),
  at('fb amount', []),
  at('tape speed (sampler)', ['sampleLevel'], { hands: true }),
  at('loop slide', ['sampleLevel'], { hands: true }),
  at('loop span', ['sampleLevel'], { hands: true }),
]

const LANDING_AT = new Map(LANDINGS.map(l => [l.dest, l]))

// The lane a wire can always land on: it opens the first feedback strip itself,
// from a fader all the way down, so there is no board on which it is dead. What
// a repair falls back to when nothing else on the board is running.
const FB_AMOUNT = choiceValue('mod0Dest', 'fb amount')

/** True when a wire landing here moves something you can hear right now. */
const heard = (c: Controls, l: Landing) =>
  l.up.every(k => isUp(c, k)) &&
  (!l.oneOf || l.oneOf.some(k => isUp(c, k))) &&
  (!l.bend || slotted(c, l.bend))

/** True when a roll is allowed to turn this landing on. */
const reachable = (c: Controls, l: Landing) =>
  !l.hands && (!l.bend || slotted(c, l.bend))

// Where a wire can pick up, and what has to be running for it to be carrying
// anything.
//
// `hands` is a source that is yours rather than the board's — the contact pad
// under your finger, the mic in front of you — so a roll neither picks one cold
// nor unsolders one you patched, and never calls one dead: it is waiting for
// you, which is what it is for.
//
// `dull` is a source that moves too slowly to be the reason a board sounds
// different. The heat is minutes of playing rather than a shape you can hear,
// so a roll reaching for it lands on a wire that reads as patched and sits
// still — but a wire you soldered there yourself is a wire, and gets repaired
// like any other.
interface Tap {
  src: number
  up: ControlKey[]
  hands?: true
  dull?: true
}

const from = (
  name: string,
  up: ControlKey[],
  rest: Omit<Tap, 'src' | 'up'> = {},
): Tap => ({ src: choiceValue('mod0Src', name), up, ...rest })

const TAPS: Tap[] = [
  from('LFO', []),
  from('envelope', []),
  // The rail sags under what the toy is drawing, so there is a droop to pick up
  // only while the toy is running.
  from('supply', ['chipLevel']),
  from('ROM step', ['chipLevel']),
  from('drum hit', ['drumLevel']),
  from('fb bus', ['fbAmt']),
  from('heat', ['heatAmt'], { dull: true }),
  from('mic', ['micLevel'], { hands: true }),
  from('body X', [], { hands: true }),
  from('body Y', [], { hands: true }),
  from('key hit', [], { hands: true }),
]

const TAP_AT = new Map(TAPS.map(t => [t.src, t]))

const moving = (c: Controls, t: Tap) => t.up.every(k => isUp(c, k))

// Where a control this file turns up on your behalf lands. Most want to be
// heard, which is the top two thirds of the travel; a feedback amount wound
// that far is a squeal rather than a wire, and a retrigger is a roll before it
// is a scream.
const WAKE_POS: Partial<Record<ControlKey, [number, number]>> = {
  fbAmt: [0.2, 0.45],
  drumRetrigHz: [0.25, 0.6],
  heatAmt: [0.4, 0.8],
}

function turnUp(
  next: Controls,
  key: ControlKey,
  rand: () => number,
  woke: Set<ControlKey>,
) {
  if (isUp(next, key)) return
  const def = sliderFor(key)
  if (def.choices) {
    next[key] = def.min + 1 + Math.floor(rand() * (def.choices.length - 1))
  } else {
    const [lo, hi] = WAKE_POS[key] ?? [0.35, 1]
    next[key] = snapToStep(def, fromPos(def, lo + rand() * (hi - lo)))
  }
  woke.add(key)
}

function wakeLanding(
  next: Controls,
  l: Landing,
  rand: () => number,
  woke: Set<ControlKey>,
) {
  for (const key of l.up) turnUp(next, key, rand, woke)
  if (l.oneOf && !l.oneOf.some(k => isUp(next, k)))
    turnUp(next, l.oneOf[0]!, rand, woke)
}

// How hard a wire pushes when the roll wants to hear it at all, and how hard it
// pushes when another wire is what opens it. A wire being driven sits at or near
// its own zero: what you hear then is the wire above it opening and closing it,
// rather than a depth that was already up with a wiggle on top.
const DEPTH = sliderFor('mod0Depth')
const sign = (rand: () => number) => (rand() < 0.5 ? -1 : 1)
const strong = (rand: () => number) =>
  snapToStep(DEPTH, sign(rand) * (0.45 + rand() * 0.55))
const gated = (rand: () => number) =>
  rand() < 0.5 ? 0 : snapToStep(DEPTH, sign(rand) * rand() * 0.3)

// A tap that is carrying something, preferring one the board is already running
// and one no other wire is already off — four wires off the same LFO is one
// wire drawn four times. Now and then it reaches for a tap that is asleep and
// turns it on instead: the feedback bus is a source nothing else would ever
// pick, since it does not exist until the loop is open.
const WAKE_TAP_ODDS = 0.2

function pickTap(
  next: Controls,
  rand: () => number,
  woke: Set<ControlKey>,
  avoid: ReadonlySet<number> = new Set(),
): number {
  const cold = (t: Tap) => !t.hands && !t.dull
  const fresh = TAPS.filter(t => cold(t) && !avoid.has(t.src))
  const free = fresh.length > 0 ? fresh : TAPS.filter(cold)
  const live = free.filter(t => moving(next, t))
  const asleep = free.filter(t => !moving(next, t))
  const pool =
    asleep.length > 0 && (live.length === 0 || rand() < WAKE_TAP_ODDS)
      ? asleep
      : live
  const tap = pool[Math.floor(rand() * pool.length)] ?? TAPS[0]!
  for (const key of tap.up) turnUp(next, key, rand, woke)
  return tap.src
}

/** What the wires are already picking up, so the next one picked is another
    signal rather than the same one again. */
const bayTaps = (c: Controls) =>
  new Set(
    WIRES.filter(w => c[w.src] !== SRC_OFF).map(w => Math.round(c[w.src])),
  )

// A landing, and the stage under it turned up if it wasn't. Live ones first,
// because a roll that turns on four stages to hear its four wires has rebuilt
// the board rather than patched it — but not only live ones, or the bay could
// never reach a stage sitting dry, which is most of a stock board.
const WAKE_DEST_ODDS = 0.5

function landOn(
  next: Controls,
  rand: () => number,
  wake: boolean,
  woke: Set<ControlKey>,
  taken: Set<number> = new Set(),
): number {
  const free = LANDINGS.filter(l => !taken.has(l.dest))
  const live = free.filter(l => heard(next, l))
  const asleep = wake
    ? free.filter(l => !heard(next, l) && reachable(next, l))
    : []
  const pool =
    asleep.length > 0 && (live.length === 0 || rand() < WAKE_DEST_ODDS)
      ? asleep
      : live.length > 0
        ? live
        : LANDINGS.filter(l => heard(next, l))
  const l = pool[Math.floor(rand() * pool.length)]
  if (!l) return FB_AMOUNT
  wakeLanding(next, l, rand, woke)
  return l.dest
}

/** Whether some other wire is driving this one's depth, which is the one case
    a wire sitting at zero depth is doing its job. */
const driven = (c: Controls, wire: number) =>
  WIRES.some(
    (w, i) =>
      i !== wire && c[w.src] !== SRC_OFF && depthTarget(c[w.dest]) === wire,
  )

// What is dead about one wire, as a phrase the panel can print after its
// number. A wire off a mic nobody has turned on, a wire onto a reverb that is
// dry, a wire onto a wire that isn’t plugged in: each one reads as a patch and
// is a row of text.
//
// Where it lands comes before what it is pushing at, because the picture says
// the second one itself — a lead at zero depth is drawn dashed either way, and
// a lead onto a stage that isn’t there looks exactly like one that is.
export function wireFault(c: Controls, wire: number): string | null {
  const w = WIRES[wire]!
  if (c[w.src] === SRC_OFF) return null
  const tap = TAP_AT.get(Math.round(c[w.src]))
  if (!tap) return 'picks up nothing'
  if (!tap.hands && !moving(c, tap)) return 'is off a source that isn’t running'
  const to = depthTarget(c[w.dest])
  if (to === wire) return 'is soldered to its own depth'
  if (to >= 0) {
    const t = WIRES[to]!
    if (c[t.src] === SRC_OFF) return `drives wire ${to + 1}, which is unplugged`
    if (depthTarget(c[t.dest]) >= 0)
      return `drives wire ${to + 1}, which reaches no stage`
  } else {
    const l = LANDING_AT.get(Math.round(c[w.dest]))
    if (!l || !heard(c, l)) return 'lands on a stage that isn’t running'
  }
  if (c[w.depth] === 0 && !driven(c, wire))
    return 'is at zero depth with nothing opening it'
  return null
}

/** Every fault in the bay, wire by wire. Empty is a bay where every lead does
    something you can hear. */
export const bayFaults = (c: Controls): string[] =>
  WIRES.flatMap((_, i) => {
    const fault = wireFault(c, i)
    return fault ? [`wire ${i + 1} ${fault}`] : []
  })

/** What the bay is already landing on, so a repair moves a wire onto something
    else rather than doubling up on a lane. */
const bayDests = (c: Controls) =>
  new Set(
    WIRES.filter(w => c[w.src] !== SRC_OFF).map(w => Math.round(c[w.dest])),
  )

export interface CohereOpts {
  /** Whether a wire may turn its destination on, rather than move to a stage
      that is already running. The bay's own dice may; the blind board dice may
      not, since a stage they took off the board on purpose would come straight
      back on. */
  wake?: boolean
}

// The pass that makes a rolled bay a patch. Nothing here invents a wire or
// pulls one out: every wire that was plugged in stays plugged in, and what
// changes is the end of it that was pointing at nothing.
export function coherePatch(
  board: Controls,
  rand: () => number,
  { wake = true }: CohereOpts = {},
): Controls {
  const next = { ...board }
  const woke = new Set<ControlKey>()

  // Where each wire picks up, first: a wire off a dead tap carries nothing
  // whatever it is soldered to, and the two passes below both go looking for
  // sources that are running.
  for (const w of WIRES) {
    if (next[w.src] === SRC_OFF) continue
    const tap = TAP_AT.get(Math.round(next[w.src]))
    if (!tap || tap.hands || moving(next, tap)) continue
    if (wake) for (const key of tap.up) turnUp(next, key, rand, woke)
    else next[w.src] = pickTap(next, rand, woke, bayTaps(next))
  }

  // Then the wires that land on another wire's depth, because what they ask of
  // that wire decides where it is allowed to land. A wire whose depth is being
  // driven has to be a wire in the first place: plugged in, and soldered to a
  // stage rather than to a third wire's depth, which the bus reads as nothing
  // at all.
  const opened = new Set<number>()
  for (const [i, w] of WIRES.entries()) {
    if (next[w.src] === SRC_OFF) continue
    let to = depthTarget(next[w.dest])
    if (to < 0) continue
    // Its own depth is the one lane a wire cannot drive — it is soldered to
    // itself and the push never reaches a stage. Send it to a neighbour.
    if (to === i) {
      to = (i + 1 + Math.floor(rand() * (WIRES.length - 1))) % WIRES.length
      next[w.dest] = DEPTH_DEST[to]!
    }
    const t = WIRES[to]!
    let invented = false
    if (next[t.src] === SRC_OFF) {
      next[t.src] = pickTap(next, rand, woke, bayTaps(next))
      invented = true
    }
    if (depthTarget(next[t.dest]) >= 0) {
      next[t.dest] = landOn(next, rand, wake, woke, bayDests(next))
      invented = true
    }
    // Only a wire this pass just made: one that was already landing somewhere
    // keeps the depth you gave it, since a push on top of a depth that is up is
    // a patch too — and a repair that re-rolled it would fight the hand that
    // set it every time a shake ran.
    if (invented) next[t.depth] = gated(rand)
    if (next[w.depth] === 0) next[w.depth] = strong(rand)
    opened.add(to)
  }

  // And last the wires that land on the board, each on something running by the
  // time this returns.
  for (const [i, w] of WIRES.entries()) {
    if (next[w.src] === SRC_OFF || depthTarget(next[w.dest]) >= 0) continue
    const l = LANDING_AT.get(Math.round(next[w.dest]))
    if (!l || !heard(next, l)) {
      if (l && wake && reachable(next, l)) wakeLanding(next, l, rand, woke)
      else next[w.dest] = landOn(next, rand, wake, woke, bayDests(next))
    }
    // A depth of zero is a wire that isn't carrying, unless the zero is the
    // point — a wire another one opens is meant to sit shut.
    if (!opened.has(i) && next[w.depth] === 0) next[w.depth] = strong(rand)
  }

  return inTime(next, key => woke.has(key))
}

// The board's other wires. Three controls rather than a bay, and the same two
// ways of being nothing: soldered onto a machine that is turned down, or onto a
// trigger line nothing ever strikes.

/** The mic wire only means anything with a mic open, and no roll can open one —
    the mic level is yours. A roll that solders it anyway hands you a wire off a
    microphone that isn't there better than half the time. */
export const micWired = (c: Controls) => isUp(c, 'micLevel')

// Whether the kit ever strikes the voice a bridge is listening to. A row with
// no steps on it is a trigger line that never fires — except under the
// cross-patch, where one voice's hit fires another's, and no row on its own
// says whether that reaches this one.
const strikes = (c: Controls, choice: number): boolean => {
  if (isUp(c, 'drumCross')) return true
  if (choice > N_DRUM_VOICES) return DRUM_VOICES.some(v => c[v.key] !== 0)
  const voice = DRUM_VOICES[choice - 1]
  return voice ? c[voice.key] !== 0 : false
}

const pickVoice = (c: Controls, rand: () => number): number => {
  const struck = [...DRUM_VOICES.keys()]
    .map(i => i + 1)
    .filter(choice => strikes(c, choice))
  if (struck.length === 0) return 0
  // The whole kit as well as any one voice of it: a bridge off every line is
  // the one that follows the pattern rather than one row of it.
  const pool = [...struck, N_DRUM_VOICES + 1]
  return pool[Math.floor(rand() * pool.length)]!
}

// The two trigger bridges, made to mean something. Which voice fires the keys
// is the half a roll gets wrong: the pattern is yours, so a bridge onto a row
// you never wrote a step on is a wire that waits for ever, and the roll cannot
// write one to fix it. It moves the bridge to a line the kit actually strikes.
export function cohereTriggers(
  board: Controls,
  rand: () => number,
  { wake = true }: CohereOpts = {},
): Controls {
  const next = { ...board }
  const woke = new Set<ControlKey>()
  if (Math.round(next.trigToKeys) > 0) {
    if (!strikes(next, Math.round(next.trigToKeys)))
      next.trigToKeys = pickVoice(next, rand)
    // The strike lands on the toy chip's key voice, which comes out at the
    // chip's own level: a bridge onto a machine turned down is silent.
    if (next.trigToKeys > 0 && !isUp(next, 'chipLevel')) {
      if (wake) turnUp(next, 'chipLevel', rand, woke)
      else next.trigToKeys = 0
    }
  }
  if (Math.round(next.trigToDrum) > 0 && !isUp(next, 'drumLevel')) {
    if (wake) turnUp(next, 'drumLevel', rand, woke)
    else next.trigToDrum = 0
  }
  return next
}

const clearBay = (next: Controls): Controls => {
  for (const w of WIRES) next[w.src] = SRC_OFF
  return next
}

// A rate you can hear as a rate. The bay's LFO runs to 400 Hz, and a roll that
// lands up there is an audio-rate carrier on whatever it is wired to — which is
// one sound, and not the one a patch is usually about. inTime lands it on the
// grid afterwards, so the sweep comes round with the pattern.
const rollLfo = (
  next: Controls,
  rand: () => number,
  lo: number,
  hi: number,
) => {
  const def = sliderFor('modLfoHz')
  next.modLfoHz = snapToStep(def, lo * Math.pow(hi / lo, rand()))
  const shape = sliderFor('modLfoShape')
  next.modLfoShape =
    shape.min + Math.floor(rand() * (shape.choices?.length ?? 1))
  inTime(next, key => key === 'modLfoHz')
}

// Two or three wires, each from a tap that is running onto a stage that is —
// and where the stage isn't, this turns it on. The bay as somebody would
// actually solder it, as against four rows of choices drawn from a hat.
export function solderBay(current: Controls, rand: () => number): Controls {
  const next = clearBay({ ...current })
  const woke = new Set<ControlKey>()
  const taken = new Set<number>()
  const count = 2 + Math.floor(rand() * 2)
  for (let i = 0; i < count; i++) {
    const w = WIRES[i]!
    next[w.src] = pickTap(next, rand, woke, bayTaps(next))
    next[w.dest] = landOn(next, rand, true, woke, taken)
    next[w.depth] = strong(rand)
    taken.add(Math.round(next[w.dest]))
  }
  rollLfo(next, rand, 0.15, 12)
  inTime(next, key => woke.has(key))
  return coherePatch(next, rand)
}

// The patch the bay is for and the panel can't tell you about: one wire soldered
// onto another wire's own depth, so what the second one does to the board is
// itself something moving. A wire opened by an envelope pushes only while a
// note is sounding; one opened by a slow LFO breathes in and out of the mix.
// Both ends are picked together — the wire underneath lands on something
// running, and sits near its own zero so the wire above it is what opens it.
export function solderCascade(current: Controls, rand: () => number): Controls {
  const next = clearBay({ ...current })
  const woke = new Set<ControlKey>()
  const taken = new Set<number>()
  const pairs = rand() < 0.5 ? 1 : 2
  for (let p = 0; p < pairs; p++) {
    const opener = WIRES[p * 2]!
    const under = WIRES[p * 2 + 1]!
    next[under.src] = pickTap(next, rand, woke, bayTaps(next))
    next[under.dest] = landOn(next, rand, true, woke, taken)
    next[under.depth] = gated(rand)
    taken.add(Math.round(next[under.dest]))
    next[opener.src] = pickTap(next, rand, woke, bayTaps(next))
    next[opener.dest] = DEPTH_DEST[p * 2 + 1]!
    next[opener.depth] = strong(rand)
  }
  // Slower than a bay roll: a wire that opens another one is a shape over
  // several bars, and at eight a second you hear the two multiplied rather than
  // one letting the other through.
  rollLfo(next, rand, 0.08, 3)
  inTime(next, key => woke.has(key))
  return coherePatch(next, rand)
}

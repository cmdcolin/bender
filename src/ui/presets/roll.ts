import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls'
import {
  ALL_SLIDERS,
  BENDS,
  type Group,
  groupKeys,
  SLIDER_BY_KEY,
  type SliderDef,
  sliderFor,
  snapToStep,
} from '../controls'
import { type DrumLenKey, GRID_ROWS, STEPS } from '../../drums'
import { randomPattern } from '../../drum-moves'
import { fromPos, toPos } from '../slider-scale'
import { applyPreset } from './apply'
import { coherePatch, cohereTriggers } from './patch'
import { inTime } from './quantize'
import { PRESETS } from './table'
import { CLOCK_KEYS, keepYours, PART_KEYS, YOURS } from './yours'

// Along the control's own travel, not across its span: a log slider moves by a
// proportion of where it sits, so a 40 ms delay comes back a few milliseconds
// away rather than halfway across the two-second range.
const nudge = (
  def: SliderDef,
  value: number,
  amount: number,
  rand: () => number,
) =>
  snapToStep(def, fromPos(def, toPos(def, value) + (rand() * 2 - 1) * amount))

// A shake lands on a handful of controls rather than on all of them. Nudging
// every one of the hundred-odd at once is the central limit theorem with a
// slider rack in front of it: each control moves by less than you can hear it
// move, none of them moves far enough to be the reason the board changed, and
// what comes back is a board creeping toward the middle of every travel — which
// is the one place nothing sounds like anything. Leaving most of them exactly
// where they were is what lets the few that did move be audible as the
// difference.
//
// How far each one goes is unchanged; amount decides how many are in it.
const shakeShare = (amount: number) => 0.12 + 0.5 * amount

// Crackle is the loudest thing on the board per notch of its slider, and it
// lands on top of the rest rather than beside it: bring it up and it is the only
// thing the roll did that you can hear. A shy control mostly sits a roll out, and
// comes on in the bottom of its travel when it comes on at all. Nothing here
// reaches your hand or the preset list — dial it where you like, and a preset
// that names crackle still crackles when you pick it by name.
const SHY_ODDS = 0.08
const SHY_TOP = 0.3

// The bottom of the travel only means anything on a control whose travel is an
// amount. A list of choices is not ordered by how much of itself it is — a
// cricket is not more effect than a bird, and D7 is not a deeper cut than D0 —
// so reading the low end as the quiet end just makes most of the list
// unreachable. A shy control with choices stays off exactly as often; when it
// does come on it takes any of them.
const shyValue = (def: SliderDef, rand: () => number) => {
  if (rand() >= SHY_ODDS) return def.min
  if (def.choices)
    return def.min + 1 + Math.floor(rand() * (def.choices.length - 1))
  return snapToStep(def, fromPos(def, rand() * SHY_TOP))
}

const calmShy = (next: Controls, rand: () => number): Controls => {
  for (const def of ALL_SLIDERS)
    if (def.shy) next[def.key] = shyValue(def, rand)
  return next
}

export function mutate(
  controls: Controls,
  amount: number,
  rand: () => number,
): Controls {
  const next = { ...controls }
  const share = shakeShare(amount)
  for (const def of ALL_SLIDERS) {
    if (YOURS.has(def.key) || CLOCK_KEYS.has(def.key) || PART_KEYS.has(def.key))
      continue
    if (def.choices) {
      if (rand() < amount * 0.5) {
        next[def.key] = def.min + Math.floor(rand() * def.choices.length)
      }
      continue
    }
    if (rand() > share) continue
    // A shy control already off stays off: a nudge is a small move, and off to
    // faintly crackling is not a small move. One you turned up yourself is a
    // control like any other from here on.
    if (def.shy && controls[def.key] === def.min) continue
    next[def.key] = nudge(def, controls[def.key], amount, rand)
  }
  inTime(next, () => true)
  // A shake reaches the bay like it reaches anything else, and either end of a
  // wire is one nudge from pointing at nothing — a source re-rolled onto a mic
  // nobody has turned on, a dry/wet nudged to zero under a wire that was landing
  // on it. Drift is this same nudge on a timer, so a board left running would
  // shake its own patch apart over a few minutes with nobody watching. The
  // repair leaves the stages where the shake put them: a nudge that turned a
  // reverb up to justify a wire is a nudge rewriting the board.
  return coherePatch(next, rand, { wake: false })
}

// Six bends wet at once is porridge — every stage half there, none of them the
// thing you are hearing. A roll that lands that way is thinned by taking bends
// off the board outright rather than by turning everything down, because a stage
// you can't pick out is worth less than a stage that isn't there.
const MAX_WET_BENDS = 3

const MIXES = new Set<ControlKey>(BENDS.map(b => b.mix))

function thinOut(next: Controls, rand: () => number): Controls {
  const wet = BENDS.filter(b => next[b.mix] > sliderFor(b.mix).min)
  for (let i = wet.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[wet[i], wet[j]] = [wet[j]!, wet[i]!]
  }
  for (const bend of wet.slice(MAX_WET_BENDS)) {
    next[bend.mix] = sliderFor(bend.mix).min
  }
  return next
}

// A roll of the dice asks for a different circuit, not a different song: the
// preset it lands on hands over its board and nothing else.
export function randomLook(current: Controls, rand: () => number): Controls {
  const preset = PRESETS[Math.floor(rand() * PRESETS.length)]!
  const rolled = thinOut(mutate(applyPreset(preset, current), 0.08, rand), rand)
  // The bay, after the thinning rather than before it: a preset can name a wire
  // onto a bend this roll just took off the board, and a wire onto a stage that
  // isn't there is a row of the panel claiming something is happening. It moves
  // that end of the wire onto something the board is running — and only that,
  // since turning the stage back on would undo the thinning that dried it.
  const next = coherePatch(rolled, rand, { wake: false })
  // A preset that names crackle names it loud, and a roll that landed on that
  // preset never asked for it. The shy controls get rolled shy whatever the
  // preset had to say about them.
  return keepYours(calmShy(next, rand), current)
}

// A roll, as against a nudge: the control takes a fresh value from anywhere on
// its own travel rather than a step off the one it had — with three things it
// knows about a board.
//
// A control the toy boots at the bottom of its travel is one that stays off
// until you ask for it, so a roll leaves it there a third of the time; turning
// every last one of them on at once is how a board goes to porridge. When a
// roll brings a logarithmic one on it comes on low more often than high, since
// half way up that travel is already most of the way up the range — a retrigger
// is a roll before it is a scream. And a dry/wet that came on at all lands in
// the top of its travel rather than at a permanent half-wet.
//
// `named` says the roll pointed at this control's own stage, which is the one
// case a shy control rolls like any other.
function rollValue(def: SliderDef, rand: () => number, named = false): number {
  const at = (pos: number) => snapToStep(def, fromPos(def, pos))
  // Ahead of everything below, including the levels: a shy control is one the
  // roll is allowed to leave off however loud its stage ends up.
  if (def.shy && !named) return shyValue(def, rand)
  // A level is the whole of whether the stage is there at all, so rolling the
  // stage always leaves it somewhere you can hear.
  if (def.role === 'level') return audible(def, rand)
  const offAtBoot = DEFAULT_CONTROLS[def.key] === def.min
  if (offAtBoot && rand() < 0.35) return def.min
  if (def.choices) return def.min + Math.floor(rand() * def.choices.length)
  // Past the boot check, not before it, unlike a level: a stage the toy boots
  // dry is one a roll is still allowed to leave off the board entirely.
  if (def.role === 'mix') return audible(def, rand)
  return at(offAtBoot && def.curve === 'log' ? rand() ** 2 : rand())
}

/** Somewhere in the top two thirds of the travel: on, and audibly so. */
const audible = (def: SliderDef, rand: () => number) =>
  snapToStep(def, fromPos(def, 0.35 + rand() * 0.65))

// Fresh values for the controls named, and nothing else on the board moved.
// What is yours and the clock sit this out, the same as they do under a nudge.
// The Parts rack does not: naming it is a hand asking for it, and the reason the
// blind dice skip the rack is that they cannot tell a dud roll from a dud board.
// Somebody who pointed at it can.
//
// `named` says the hand pointed at these controls in particular rather than at
// a board they happen to be on, which is the one case a shy control rolls like
// any other — pressing the dice on the crackle is asking for crackle. It is
// also the one that has to land somewhere you weren't: every control the toy
// boots off stays off a third of the time, which is what stops a board roll
// turning the lot on at once, and over a handful that all boot off it stacks.
// Pressing roll on a fold of four left the board exactly where it stood one
// press in thirty-seven, which reads as the panel not answering — so a named
// roll goes again rather than hand one back. Bounded, because a set with
// nothing in it that can move would never come back.
const ROLL_TRIES = 5

export function rollKeys(
  current: Controls,
  keys: Iterable<ControlKey>,
  rand: () => number,
  named = false,
): Controls {
  const once = () => {
    const next = { ...current }
    const moved = new Set<ControlKey>()
    for (const key of keys) {
      if (YOURS.has(key) || CLOCK_KEYS.has(key)) continue
      const def = SLIDER_BY_KEY.get(key)
      if (!def) continue
      next[key] = rollValue(def, rand, named)
      moved.add(key)
    }
    return { board: inTime(next, k => moved.has(k)), moved }
  }
  const stirred = (r: ReturnType<typeof once>) =>
    [...r.moved].some(k => r.board[k] !== current[k])
  let roll = once()
  for (let i = 1; named && i < ROLL_TRIES && !stirred(roll); i++) roll = once()
  return roll.board
}

/** The controls named, back where they booted, and nothing else moved. */
export function resetKeys(
  current: Controls,
  keys: Iterable<ControlKey>,
): Controls {
  const next = { ...current }
  for (const key of keys) next[key] = DEFAULT_CONTROLS[key]
  return next
}

// One row running against the others, about half the time. A fresh length on
// every row is six patterns none of which is the one you hear, so the kick keeps
// its bar and one of the trimmings drifts against it — and the lengths that read
// as polymeter rather than as a dropped step are the ones sixteen doesn't divide.
const ODD_LENGTHS = [3, 5, 6, 7, 9, 11, 13, 14, 15]
const DRIFTERS = ['drumHat', 'drumBell', 'drumTom', 'drumAccent'] as const

function rollLengths(rand: () => number): Record<DrumLenKey, number> {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!
  const lens = Object.fromEntries(GRID_ROWS.map(r => [r.len, STEPS])) as Record<
    DrumLenKey,
    number
  >
  if (rand() < 0.45) lens[`${pick(DRIFTERS)}Len`] = pick(ODD_LENGTHS)
  return lens
}

// Roll one stage of the board and leave every other stage alone. The kit is the
// one stage whose pattern is part of what it is, so its own roll writes the grid
// too — the general rolls never touch it, but this is the button that names it.
export function rollGroup(
  group: Group,
  current: Controls,
  rand: () => number,
): Controls {
  // Everything the group draws, borrowed faders included: a roll on the mix bus
  // is a roll of the balance, and a desk that rolled only its own summing amp
  // would be a dice that left the one thing the panel is about exactly where it
  // stood. The kit's own grid comes off the bottom of this function instead —
  // no step of it has a slider, so rollKeys walks straight past them.
  const next = rollKeys(current, groupKeys(group), rand)
  // The rack borrows every bend's dry/wet, so its own dice can wet all seven at
  // once — which is the porridge the blind dice are thinned to avoid, arrived at
  // from the one panel where the order of the chain is the thing you are trying
  // to hear. Thinned the same way, and only where a roll covers more than one of
  // them: a bend's own panel rolling its own mix is not a chain.
  if (groupKeys(group).filter(k => MIXES.has(k)).length > 1) thinOut(next, rand)
  // Pressing the dice on the crackle is asking for crackle: the shy controls of
  // the stage you pointed at roll the way the rest of the board's do. Shy is
  // about what a roll of the whole board hands you unasked.
  for (const def of group.sliders) {
    if (def.shy) next[def.key] = rollValue(def, rand, true)
  }
  // You rolled this stage in order to hear it, so its own dry/wet doesn't get
  // to land at zero. Turning a stage off is what the reset beside this is for.
  const mix = group.sliders.find(s => s.role === 'mix')
  if (mix && next[mix.key] === mix.min) next[mix.key] = audible(mix, rand)
  // The bay is the one panel whose controls are about the rest of the board
  // rather than about itself: a wire is a source, a destination and a depth that
  // only mean anything together, and three sliders rolled apart is three ends
  // that don't meet. Pointing the dice at it is asking for a patch, so this one
  // is allowed to turn up what it lands on.
  if (group.editor?.kind === 'patch') return coherePatch(next, rand)
  // The same for the two trigger bridges, which are wires by another name: a
  // bridge onto a row the pattern never strikes waits for ever, and pointing
  // the dice at the panel is asking for the bridge, so this one may turn the
  // machine at the far end of it up.
  if (group.editor?.kind === 'trigger') return cohereTriggers(next, rand)
  if (group.editor?.kind !== 'drums') return next
  return { ...next, ...randomPattern(rand), ...rollLengths(rand) }
}

/** Every control the stage owns, back where it booted. */
export const resetGroup = (group: Group, current: Controls): Controls =>
  resetKeys(current, groupKeys(group))

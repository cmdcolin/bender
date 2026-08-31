import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import {
  bursts,
  deviation,
  envelope,
  pitchHz,
  quiet,
  render,
  renderBender,
  rms,
  SR,
  tail,
} from '../testRender'

// The oscillator on its own, with the other two boxes down: everything here is
// about the pair and the supply under them, and the kit — which is up on a
// stock board and running from the first sample offline — is a second voice in
// every measurement. Muting it takes the board's floor to exactly zero.
const OSC: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  oscLevel: 0.8,
  oscAHz: 220,
  oscBHz: 0.1,
  oscXmod: 0,
  oscStarve: 0,
}

test('B pulls A off its dial, and how far is the cross-mod knob', () => {
  const still = render({ ...OSC, oscBHz: 3 }, 1)
  const pulled = render({ ...OSC, oscBHz: 3, oscXmod: 400 }, 1)
  // B is a square, so A sits at one of two frequencies rather than sweeping
  // between them — the crossing rate over a whole second is the mean of the
  // pair, and 400 Hz of swing moves it well clear of where it was parked.
  expect(pitchHz(still)).toBeGreaterThan(200)
  expect(pitchHz(still)).toBeLessThan(240)
  expect(Math.abs(pitchHz(pulled) - pitchHz(still))).toBeGreaterThan(40)
})

// The stall is the instrument. A rail the output current can pull under the
// point A gives up at is a rail that gets paid back the moment A goes quiet,
// and the two of them take turns for as long as you leave it — so what comes
// out is a run of events on a board where nothing is sequencing anything.
test('a starved rail motorboats without anything triggering it', () => {
  const steady = render(OSC, 4)
  const stalling = render({ ...OSC, oscStarve: 0.7 }, 4)
  expect(quiet(steady)).toBeLessThan(0.05)
  expect(quiet(stalling)).toBeGreaterThan(0.15)
  expect(bursts(stalling)).toBeGreaterThan(4)
})

// Which way the knob goes, which is the half a starving supply gets backwards
// if the pot is only a drain. It is a resistor in the supply lead, so winding
// it up feeds the rail less as well as pulling more out of it: the climb back
// gets longer and the motorboat slows. Turned up, the board goes from a chop to
// slow heavy heaves — and it spends more of the run stalled the whole way, so
// the two measurements move opposite ways and neither is the other in disguise.
test('starving harder slows the motorboat down rather than speeding it up', () => {
  const rate = (oscStarve: number) =>
    bursts(render({ ...OSC, oscStarve }, 6)) / 6
  expect(rate(0.3)).toBeGreaterThan(rate(1) * 1.5)
  expect(rate(1)).toBeGreaterThan(2)
  expect(quiet(render({ ...OSC, oscStarve: 1 }, 6))).toBeGreaterThan(
    quiet(render({ ...OSC, oscStarve: 0.3 }, 6)),
  )
})

test('the rail drags the pitch down as well as the level', () => {
  const open = tail(render(OSC, 2), 1)
  // Enough to sag the rail and hold it there, not enough to cut A off: what is
  // being measured is the pitch of a running oscillator on a low supply.
  const sagging = tail(render({ ...OSC, oscStarve: 0.12 }, 2), 1)
  expect(rms(sagging)).toBeLessThan(rms(open))
  expect(pitchHz(sagging)).toBeLessThan(pitchHz(open) * 0.97)
})

// The board is one wall-wart. Before this the oscillator was the last source
// that ran at exactly the settings you gave it while the rest of the board
// browned out around it.
test('a supply dying elsewhere on the board takes the oscillator with it', () => {
  const alone = render(OSC, 3)
  const browning = render({ ...OSC, brownAmt: 0.9, brownRate: 3 }, 3)
  expect(deviation(browning, alone)).toBeGreaterThan(0.1)
})

test('a wire reaches the oscillator’s own starve pot', () => {
  const look: Partial<Controls> = {
    ...OSC,
    oscStarve: 0.3,
    modLfoHz: 2,
    mod0Src: 1,
    mod0Depth: 0.9,
  }
  const parked = render(look, 3)
  const wired = render({ ...look, mod0Dest: DEST.oscStarve }, 3)
  expect(deviation(wired, parked)).toBeGreaterThan(0.05)
  // An LFO on the pot is a stall that arrives in time rather than whenever the
  // rail happens to give out: the run reads as a level going somewhere and
  // coming back, over and over, which a free-running motorboat does not.
  const env = envelope(wired)
  const peak = env.reduce((a, v) => Math.max(a, v), 0)
  expect(env.reduce((a, v) => a + (v < peak * 0.1 ? 1 : 0), 0)).toBeGreaterThan(
    0,
  )
})

// The lane every other pitched thing on the board already had. With one on A
// the oscillator is played rather than set: an S&H holds a fresh note each
// cycle, which is the bay doing the job no keybed here does.
test('a wire moves oscillator A off the dial it is set to', () => {
  const look: Partial<Controls> = {
    ...OSC,
    modLfoHz: 3,
    modLfoShape: 3,
    mod0Src: 1,
    mod0Depth: 0.5,
  }
  const parked = render(look, 2)
  const played = render({ ...look, mod0Dest: DEST.oscHz }, 2)
  expect(pitchHz(parked)).toBeGreaterThan(200)
  expect(pitchHz(parked)).toBeLessThan(240)
  expect(deviation(played, parked)).toBeGreaterThan(0.3)
})

// And it is the note that moved, not the level: the wire is soldered to the
// frequency, so a run of held steps is a run of pitches rather than a tremolo.
test('the wire on A moves the pitch and leaves the level where it was', () => {
  const look: Partial<Controls> = {
    ...OSC,
    modLfoHz: 2,
    modLfoShape: 3,
    mod0Src: 1,
    mod0Depth: 0.4,
  }
  const parked = render(look, 3)
  const played = render({ ...look, mod0Dest: DEST.oscHz }, 3)
  expect(pitchHz(played)).not.toBeCloseTo(pitchHz(parked), 0)
  expect(rms(played)).toBeGreaterThan(rms(parked) * 0.8)
  expect(rms(played)).toBeLessThan(rms(parked) * 1.2)
})

test('the feedback bus on the FM pin plays the pitch', () => {
  const look: Partial<Controls> = {
    ...OSC,
    oscAHz: 110,
    fbAmt: 1.1,
    fbDelayMs: 40,
  }
  const dry = render(look, 2)
  const howling = render({ ...look, fbDest: 1 }, 2)
  expect(deviation(howling, dry)).toBeGreaterThan(0.1)
})

// The stage runs while the return is on its FM pin whether or not the fader is
// up, and this is what that buys: the rail is starving and the phase is
// turning behind a closed fader, so opening one drops you into a cycle already
// in progress rather than striking a new one. The board is silent either way
// until the hand moves, so the whole of the difference is that guard.
test('the return keeps the oscillator turning behind a closed fader', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0,
    oscLevel: 0,
    oscAHz: 110,
    oscStarve: 0.5,
    fbDelayMs: 40,
    fbDest: 1,
  }
  const openAt1s = (fbAmt: number) =>
    renderBender({ ...look, fbAmt }, 2, undefined, undefined, (_, secs, p) => {
      if (secs >= 1) p[IDX.oscLevel] = 0.8
    }).subarray(SR)
  const running = openAt1s(1.2)
  const cold = openAt1s(0)
  expect(rms(cold)).toBeGreaterThan(0.01)
  expect(deviation(running, cold)).toBeGreaterThan(0.1)
})

test('a panicked oscillator comes back where it booted', () => {
  const first = render({ ...OSC, oscStarve: 0.6, oscXmod: 600 }, 1)
  const again = render({ ...OSC, oscStarve: 0.6, oscXmod: 600 }, 1)
  expect(again).toEqual(first)
})

test('A never runs past the point the sample rate can carry it', () => {
  const wild = render({ ...OSC, oscAHz: 12000, oscBHz: 9000, oscXmod: 8000 }, 1)
  for (const v of wild) expect(Number.isFinite(v)).toBe(true)
  expect(Math.max(...wild.map(Math.abs))).toBeLessThanOrEqual(1)
  // Nothing has folded down onto dc: a phase increment past a half-cycle a
  // sample would come back as a slow beat rather than as the top end it was.
  expect(rms(wild.subarray(SR / 2))).toBeGreaterThan(0.01)
})

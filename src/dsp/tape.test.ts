import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { bin, renderBender, sine } from './testRender'
import { packParams } from '../engine/params'
import { buildChain, type BuiltChain } from './build'
import { BLOCK, type StereoBlock } from './stage'

const SR = 48000

function render(overrides: Partial<Controls>, seconds: number, seed = 1) {
  const chain = buildChain(SR, seed)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const l = new Float32Array(blocks * BLOCK)
  const r = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, p)
    l.set(io.l.subarray(0, BLOCK), b * BLOCK)
    r.set(io.r.subarray(0, BLOCK), b * BLOCK)
  }
  return { l, r }
}

const rms = (x: Float32Array) =>
  Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length)
const db = (x: number) => 20 * Math.log10(x)

// Energy above the midband as a fraction of the whole, via a first-difference
// high pass. Enough to rank two renders by brightness.
function bright(x: Float32Array): number {
  let hp = 0
  for (let i = 1; i < x.length; i++) hp += (x[i]! - x[i - 1]!) ** 2
  return Math.sqrt(hp / x.length) / (rms(x) + 1e-12)
}

// Where a steady tone crosses zero going up, to a fraction of a sample. Counting
// whole crossings in a window instead quantises the pitch to one crossing in
// 2400 samples, which at 220 Hz is 0.45% — coarser than the wander this file
// asserts on, so a transport wobbling by a third of a percent read as either
// zero or twice the truth depending on where the crossings happened to land.
function crossings(x: Float32Array): number[] {
  const t: number[] = []
  for (let i = 1; i < x.length; i++) {
    const a = x[i - 1]!
    const b = x[i]!
    if (a <= 0 && b > 0) t.push(a === b ? i : i - 1 + -a / (b - a))
  }
  return t
}

// Pitch wander as a percentage: how much the period of a steady tone drifts
// over the render, measured across eight cycles at a time.
function wander(x: Float32Array): number {
  const t = crossings(x.subarray(SR))
  const hz: number[] = []
  for (let i = 8; i < t.length; i++) {
    const f = (8 * SR) / (t[i]! - t[i - 8]!)
    if (Number.isFinite(f)) hz.push(f)
  }
  if (hz.length === 0) return 0
  const mean = hz.reduce((a, b) => a + b, 0) / hz.length
  const sd = Math.sqrt(hz.reduce((a, b) => a + (b - mean) ** 2, 0) / hz.length)
  return (sd / mean) * 100
}

// What the machine does to one frequency, in dB against the same tone with the
// tape out of circuit — so whatever the source did cancels and what is left is
// the machine. The sampler is the one thing on the board that plays a clean
// sine, and a whole number of cycles in a one-second loop comes round without a
// splice to hear.
function response(
  hz: number,
  over: Partial<Controls> = {},
  amp = 0.06,
): number {
  const board: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0,
    sampleLevel: 1,
    tapeHiss: 0,
    tapeWow: 0,
    tapeFlutter: 0,
    tapeDrive: 0,
    tapeHyst: 0,
    tapeBump: 0,
    ...over,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(hz, 1, amp))
  const at = (mix: number) =>
    bin(renderBender({ ...board, tapeMix: mix }, 2, load).subarray(SR), hz)
  return db(at(1) / at(0))
}

const SILENT: Partial<Controls> = { chipLevel: 0, drumLevel: 0 }
const TONE: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  oscLevel: 0.7,
  oscAHz: 220,
  oscXmod: 0,
}
const STEADY: Partial<Controls> = { tapeHiss: 0, tapeWow: 0, tapeFlutter: 0 }

test('hiss is a floor of its own — audible with nothing playing, gone when turned down', () => {
  const { l } = render({ ...SILENT, tapeMix: 1, tapeHiss: 1 }, 1)
  const floor = rms(l.subarray(SR / 2))
  expect(db(floor)).toBeGreaterThan(-50)
  expect(db(floor)).toBeLessThan(-30)
  expect(rms(render({ ...SILENT, tapeMix: 1, tapeHiss: 0 }, 1).l)).toBe(0)
})

test('a slower tape hisses louder and darker', () => {
  const at = (speed: number) =>
    render(
      { ...SILENT, tapeMix: 1, tapeHiss: 1, tapeSpeed: speed },
      1,
    ).l.subarray(SR / 2)
  const [slow, mid, fast] = [at(0), at(1), at(2)]
  expect(rms(slow)).toBeGreaterThan(rms(mid))
  expect(rms(mid)).toBeGreaterThan(rms(fast))
  expect(bright(slow)).toBeLessThan(bright(mid))
  expect(bright(mid)).toBeLessThan(bright(fast))
})

test('speed sets how much top end survives the head gap', () => {
  const at = (speed: number) =>
    bright(
      render(
        { ...TONE, ...STEADY, tapeMix: 1, tapeSpeed: speed },
        1,
      ).l.subarray(SR / 2),
    )
  expect(at(0)).toBeLessThan(at(1))
  expect(at(1)).toBeLessThan(at(2))
  expect(at(2)).toBeLessThan(
    bright(render({ ...TONE, ...STEADY }, 1).l.subarray(SR / 2)),
  )
})

// Record and replay are one shelf and its inverse. Run both from the same
// corner — which is the obvious thing to write and what this did for a long
// time — and they do not cancel: what is left over is a couple of dB sitting on
// 1.2 kHz, so a machine at rest handed back every board with a presence lift
// nobody had asked it for. Below the head gap there is nothing left for the tape
// to do, so a tone down there has to come back the level it went in at.
test('the record and replay curves cancel below the head gap', () => {
  for (const hz of [50, 120, 300, 700, 1200, 2000])
    expect(Math.abs(response(hz, { tapeSpeed: 2 })), `${hz} Hz`).toBeLessThan(
      0.4,
    )
})

// Gap loss is flat and then a cliff — a wavelength either fits across the gap
// or it cancels in it. A single pole is a tone control instead: it starts
// taking the top off the midrange an octave early and still passes 20 kHz at
// 3¾ ips, where a real machine has nothing up there at all.
test('the head gap is a cliff rather than a tone control', () => {
  const slow = (hz: number) => response(hz, { tapeSpeed: 0 })
  const [flat, knee, over, gone] = [
    slow(2000),
    slow(4000),
    slow(8000),
    slow(16000),
  ]
  expect(Math.abs(flat)).toBeLessThan(1)
  expect(gone).toBeLessThan(-9)
  // An octave further past the knee costs more than the octave before it did.
  expect(gone - over).toBeLessThan(over - knee)
})

// Short wavelengths demagnetise themselves: two domains a wavelength apart
// pointing opposite ways each sit in the other's field, and the harder the tape
// has been driven the more field there is to sit in. So the top of the band has
// ten or fifteen dB less headroom than the bottom, and a machine played into
// hard goes dull before it goes loud — most of why tape takes the fizz off a
// cymbal where a clipper only adds to it. Wound down, the same machine at the
// same settings is nearly a wire.
//
// It is a wavelength that demagnetises itself, so a faster tape lays that
// wavelength out longer and keeps more of it: the whole point of the speed
// switch is that a machine you can afford to run fast is one you can afford to
// hit. Asserted at both ends of the switch rather than at one speed, because
// scaling the replay *coefficient* instead of the corner cost the fastest tape
// the most — a 2.2× overshoot at 15 ips against 1.3× at 3¾ — and squeezed the
// three machines together at 18.6, 12.7 and 11.1 dB, where the wavelength says
// they should be far apart. 15 ips leant on came back darker at 10 kHz than 3¾
// does at rest, which is not a speed switch worth having.
test('the top of the band has less headroom than the bottom', () => {
  const extra = (tapeSpeed: number) => {
    const at = (hz: number, amp: number) => response(hz, { tapeSpeed }, amp)
    const quiet = [at(500, 0.02), at(10000, 0.02)]
    const loud = [at(500, 0.8), at(10000, 0.8)]
    // Wound down it is nearly a wire, and the bottom keeps what it had either
    // way — whatever the top loses, it loses on its own.
    expect(Math.abs(quiet[0]!), `${tapeSpeed} quiet`).toBeLessThan(0.5)
    expect(loud[0]!, `${tapeSpeed} loud`).toBeGreaterThan(-3)
    return loud[0]! - loud[1]!
  }
  const [slow, mid, fast] = [extra(0), extra(1), extra(2)]
  expect(slow).toBeGreaterThan(10)
  expect(mid).toBeLessThan(slow)
  expect(fast).toBeLessThan(mid)
  // And far apart rather than merely in order: a tape running four times as
  // fast keeps most of its top end through the same beating.
  expect(fast).toBeLessThan(8)
  // And a fast machine at rest still has its top end to lose.
  expect(response(10000, { tapeSpeed: 2 }, 0.02)).toBeGreaterThan(-2)
})

// At 15 ips the head gap already sits past the programme, so bias can't work
// through the gap corner alone — it needs its own record tilt or the knob
// inverts at the fast speed. Self-erasure pushes the same way, since under-bias
// records hotter and hotter is what the medium erases off itself, so the tilt
// has to beat both.
//
// Every step has to be audibly darker rather than merely measurably darker: the
// knob went flat to within half a percent at 15 ips once, and a test that only
// asked for a decrease called that passing.
test('bias runs bright to dull at every speed', () => {
  for (const speed of [0, 1, 2]) {
    const steps = [-1, -0.5, 0, 0.5, 1].map(bias =>
      bright(
        render(
          { ...TONE, ...STEADY, tapeMix: 1, tapeSpeed: speed, tapeBias: bias },
          1,
        ).l.subarray(SR / 2),
      ),
    )
    for (let i = 1; i < steps.length; i++)
      expect(
        steps[i]! / steps[i - 1]!,
        `speed ${speed} step ${i}`,
      ).toBeLessThan(0.985)
  }
})

test('record level compresses without running away — makeup holds it near unity', () => {
  const dry = rms(render({ ...TONE, ...STEADY }, 1).l.subarray(SR / 2))
  for (const drive of [-12, -6, 0, 6, 12, 15]) {
    const wet = rms(
      render(
        { ...TONE, ...STEADY, tapeMix: 1, tapeDrive: drive },
        1,
      ).l.subarray(SR / 2),
    )
    expect(Math.abs(db(wet / dry))).toBeLessThan(4)
  }
})

// The knob that is meant to buy distortion must not spend level to do it. The
// makeup was a power of the record level, which gives it back to small signals
// and to nothing else: the clipper's ceiling does not move, so scaling it down
// afterwards dropped the replay ceiling as the knob went up — 5 dB at stock and
// 11 at the top. Anything already pinned by the time it reaches the machine is
// by definition over that ceiling, so the whole of a board being played hard
// came off the tape at whatever the knob had left, and turning the knob up to
// hear the machine work turned the machine down.
test('a record level wound up buys distortion and not silence', () => {
  const hot = { ...SILENT, sampleLevel: 1, ...STEADY, tapeHyst: 0 }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(220, 1, 0.9))
  const at = (over: Partial<Controls>) =>
    rms(renderBender({ ...hot, ...over }, 2, load).subarray(SR))
  const dry = at({ tapeMix: 0 })
  const levels = [-12, -6, 0, 6, 12, 15].map(tapeDrive =>
    db(at({ tapeMix: 1, tapeDrive }) / dry),
  )
  for (const [i, level] of levels.entries())
    expect(level, `${[-12, -6, 0, 6, 12, 15][i]} dB`).toBeGreaterThan(-4)
  expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(2)
})

// A dropout is a hole in the oxide: it takes signal away and it does nothing
// else. It has no business making a noise of its own, and none whatever making
// one that gets louder as a different knob goes up.
//
// It did both. Hysteresis sits the record curve off centre, and a compressive
// curve read off centre leaves a mean behind — one that rides the programme
// envelope, so it wanders at a few Hz rather than sitting still. The head
// handed that to the replay side along with the signal, the dropouts multiplied
// what the head handed over, and so every hole in the oxide stepped the mean and
// the board's blocker turned each step into a thump: eight dB of sub-40 Hz on a
// tone that had none in it, keyed to a warmth control.
test('a dropout takes signal away without thumping', () => {
  const under40 = (x: Float32Array) => {
    const c = 1 - Math.exp((-2 * Math.PI * 40) / SR)
    let y = 0
    let peak = 0
    for (let i = 0; i < x.length; i++) {
      y += c * (x[i]! - y)
      peak = Math.max(peak, Math.abs(y))
    }
    return db(peak)
  }
  const at = (tapeHyst: number) =>
    under40(
      renderBender(
        {
          ...SILENT,
          sampleLevel: 1,
          ...STEADY,
          tapeMix: 1,
          tapeDrop: 1,
          tapeBump: 0,
          tapeHyst,
        },
        4,
        b => b.sampler.setBuffer(sine(800, 1, 0.7)),
      ).subarray(SR),
    )
  // Whatever low end a dropout makes by being a dropout is the floor. Winding
  // the curve off centre must not add to it.
  const floor = at(0)
  expect(at(0.3), 'stock').toBeLessThan(floor + 1)
  expect(at(1), 'wound up').toBeLessThan(floor + 1)
})

// Read off the sampler's sine rather than the oscillator's square. A square
// through a wobbling head has ringing on its edges, and once the flutter grain
// is real that ringing crosses zero more than once on the way past — so the
// period estimate reads a cycle that never happened, and one seed in five came
// back with four times the wander the transport was actually doing.
//
// Twelve seconds because the reading is a spread, and a spread wants enough of
// the slowest thing in it to have happened. Wow at 3¾ ips is a 1.8 second cycle
// and the drift under it is minutes long: at four seconds the number had not
// settled — 3.17, then 2.41 by eight and 1.93 by sixteen — so the bound below
// was sitting on the sampling error rather than on the transport, and anything
// that moved where the zero crossings landed moved it by a decibel of wow that
// was never there.
test('the transport wobbles the pitch, and holds it dead steady when wound down', () => {
  const at = (w: number) =>
    wander(
      renderBender(
        {
          chipLevel: 0,
          drumLevel: 0,
          sampleLevel: 1,
          tapeHiss: 0,
          tapeMix: 1,
          tapeWow: w,
          tapeFlutter: w,
          tapeSpeed: 0,
        },
        12,
        b => b.sampler.setBuffer(sine(220, 1, 0.6)),
      ),
    )
  // Wound down it is steady to the floor of the measurement itself, which is
  // where a sample-rate estimate of a 220 Hz period bottoms out.
  expect(at(0)).toBeLessThan(0.05)
  expect(at(0.3)).toBeGreaterThan(0.2)
  // Reading the period rather than counting crossings resolves the two apart,
  // so the knob can be held to roughly what it says rather than merely to more.
  expect(at(1)).toBeGreaterThan(at(0.3) * 2)
  expect(at(1)).toBeLessThan(3)
})

// Eight seconds because the reading is the deepest window in the render, which
// is one draw off a random process rather than an average of it: a shorter take
// reports whichever dropout happened to land in it, and rank the seed
// differently and the number moves by 6 dB without the model having changed.
test('dropouts dip the level, and shed highs on the way down', () => {
  const quietest = (drop: number) => {
    const { l } = render({ ...TONE, ...STEADY, tapeMix: 1, tapeDrop: drop }, 8)
    let min = Infinity
    for (let i = SR; i + 1200 < l.length; i += 600)
      min = Math.min(min, rms(l.subarray(i, i + 1200)))
    return min
  }
  expect(db(quietest(0.5) / quietest(0))).toBeLessThan(-4)
  expect(db(quietest(1) / quietest(0))).toBeLessThan(-10)
})

// Oxide sheds in patches, and a patch sits on one track. Held on the transport
// rather than on the heads, every dropout was a mono event arriving on both
// channels at once, which is the one thing a hole in the oxide never is.
test('a dropout lands on one track rather than on both', () => {
  const apart = (tapeDrop: number) => {
    const { l, r } = render({ ...TONE, ...STEADY, tapeMix: 1, tapeDrop }, 8)
    let worst = 0
    for (let i = SR; i + 1200 < l.length; i += 600)
      worst = Math.max(
        worst,
        Math.abs(
          db(rms(l.subarray(i, i + 1200)) / rms(r.subarray(i, i + 1200))),
        ),
      )
    return worst
  }
  // With nothing shedding and the heads square with each other, the two tracks
  // are the same piece of tape.
  expect(apart(0)).toBe(0)
  expect(apart(1)).toBeGreaterThan(6)
})

// The gap to the first patch is drawn like every other gap. Held at nought, the
// counter was one that had already expired, so every take opened on a dropout —
// on both heads at once and at whatever the knob said, which is the one place a
// hole in the oxide never lands. The windows above all start a second in and saw
// none of it.
test('a take does not open on a dropout', () => {
  const opening = (x: Float32Array) => rms(x.subarray(240, 2640))
  let clean = 0
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const shed = render(
      { ...TONE, ...STEADY, tapeMix: 1, tapeDrop: 1 },
      2,
      seed,
    )
    const whole = render(
      { ...TONE, ...STEADY, tapeMix: 1, tapeDrop: 0 },
      2,
      seed,
    )
    if (db(opening(shed.l) / opening(whole.l)) > -0.5) clean++
    if (db(opening(shed.r) / opening(whole.r)) > -0.5) clean++
  }
  // A gap averaging a third of a second lands inside the first fifty
  // milliseconds about one take in seven, so one or two of the sixteen are a
  // real arrival. All sixteen was the counter.
  expect(clean).toBeGreaterThan(12)
})

test('print-through leaves a ghost one spool wrap behind the signal', () => {
  const ghost = (print: number) => {
    const chain = buildChain(SR)
    const io: StereoBlock = {
      l: new Float32Array(BLOCK),
      r: new Float32Array(BLOCK),
      n: BLOCK,
    }
    const on = packParams({
      ...DEFAULT_CONTROLS,
      ...TONE,
      ...STEADY,
      tapeMix: 1,
      tapePrint: print,
    })
    const off = packParams({
      ...DEFAULT_CONTROLS,
      ...SILENT,
      oscLevel: 0,
      tapeMix: 1,
      tapeHiss: 0,
      tapePrint: print,
    })
    const blocks = Math.ceil((1.5 * SR) / BLOCK)
    const out = new Float32Array(blocks * BLOCK)
    for (let b = 0; b < blocks; b++) {
      chain.process(io, b * BLOCK < 0.2 * SR ? on : off)
      out.set(io.l.subarray(0, BLOCK), b * BLOCK)
    }
    // 7½ ips wraps in 450 ms; the burst ends at 200 ms
    return rms(out.subarray(Math.floor(0.62 * SR), Math.floor(0.68 * SR)))
  }
  expect(db(ghost(1))).toBeGreaterThan(-45)
  expect(db(ghost(1))).toBeLessThan(-25)
  expect(db(ghost(0))).toBeLessThan(-100)
})

test('azimuth error collapses badly to mono', () => {
  const collapse = (az: number) => {
    const { l, r } = render(
      { ...TONE, ...STEADY, tapeMix: 1, tapeAzimuth: az },
      1,
    )
    const mono = new Float32Array(l.length)
    for (let i = 0; i < l.length; i++) mono[i] = 0.5 * (l[i]! + r[i]!)
    return db(rms(mono.subarray(SR / 2)) / rms(l.subarray(SR / 2)))
  }
  expect(Math.abs(collapse(0))).toBeLessThan(0.5)
  expect(collapse(1)).toBeLessThan(-2)
})

test('the machine at rest colours but does not wreck the signal', () => {
  const dry = render({ chipLevel: 0.5, ...STEADY }, 2)
  const wet = render(
    { chipLevel: 0.5, ...STEADY, tapeMix: 1, tapeDrive: 0, tapeSpeed: 2 },
    2,
  )
  const n = 60000
  const lat = Math.round(0.01 * SR)
  const err = new Float32Array(n)
  for (let i = 0; i < n; i++)
    err[i] = wet.l[SR / 2 + i + lat]! - dry.l[SR / 2 + i]!
  expect(db(rms(err) / rms(dry.l.subarray(SR / 2, SR / 2 + n)))).toBeLessThan(
    -12,
  )
})

// Warmth, as against crunch. A symmetrical clipper makes the third harmonic and
// the fifth and never the second — so the second is the whole of what the
// hysteresis knob is for, and a square wave is the test that cannot be fooled:
// it has no even harmonics of its own to borrow one from.
test('hysteresis puts a second harmonic on a wave that has none', () => {
  const at = (tapeHyst: number) => {
    const { l } = render(
      { ...TONE, ...STEADY, tapeMix: 1, tapeDrive: 6, tapeHyst },
      2,
    )
    const played = l.subarray(SR)
    return bin(played, 440) / bin(played, 220)
  }
  expect(db(at(0))).toBeLessThan(-60)
  expect(db(at(0.3))).toBeGreaterThan(-40)
  expect(at(1)).toBeGreaterThan(at(0.3))
  expect(at(0.3)).toBeGreaterThan(at(0.1))
})

// It rides the level rather than the note: the same board played quietly is the
// same board without the bloom, which is what separates this from a knob that
// simply adds a harmonic.
test('the bloom comes up with how hard the tape is driven', () => {
  const at = (oscLevel: number) => {
    const { l } = render(
      { ...TONE, ...STEADY, oscLevel, tapeMix: 1, tapeHyst: 1 },
      2,
    )
    const played = l.subarray(SR)
    return bin(played, 440) / bin(played, 220)
  }
  expect(at(0.7)).toBeGreaterThan(at(0.08) * 2)
})

// The record level makes its own gain up on the way out, so a head driven twice
// as hard plays back at about the same level — which is why how much the medium
// is carrying has to be read off what the record head wrote and not off what
// came back from the replay head. Read off the playback side, the knob ran
// backwards: the harder the tape was hit the less it bloomed.
//
// Right at the top it does turn over, and that is the medium rather than the
// model — past saturation both halves of the wave are flat against the same
// ceiling and there is no asymmetry left to hear. What has to hold is the climb
// through the range the knob is actually used over, and that the top of it is
// still nothing like the bottom.
test('the bloom climbs with the record level rather than falling away', () => {
  const at = (tapeDrive: number) => {
    const { l } = render(
      { ...TONE, ...STEADY, tapeMix: 1, tapeHyst: 0.3, tapeDrive },
      2,
    )
    const played = l.subarray(SR)
    return bin(played, 440) / bin(played, 220)
  }
  const [cold, mid, stock] = [at(-12), at(0), at(6)]
  expect(cold).toBeLessThan(mid)
  expect(mid).toBeLessThan(stock)
  expect(db(stock / cold)).toBeGreaterThan(15)
  expect(at(15)).toBeGreaterThan(cold)
})

// Turned off, the head is the symmetrical clipper it always was — so a board
// that never asked for warmth is bit-identical to the machine before it had a
// knob for it.
test('hysteresis at zero leaves the record head symmetrical', () => {
  const board: Partial<Controls> = {
    ...TONE,
    ...STEADY,
    tapeMix: 1,
    tapeDrive: 12,
  }
  const off = render({ ...board, tapeHyst: 0 }, 1).l
  expect(render({ ...board, tapeHyst: 0.5 }, 1).l).not.toEqual(off)
  const quiet = render({ ...board, tapeHyst: 0, oscLevel: 0 }, 1).l
  expect(rms(quiet)).toBe(0)
})

// The bump is a resonance the head has by being a head, so its frequency is the
// speed's and only its size is yours — and stock has to be exactly the fixed
// amount the machine was built with, or every board that ever used the tape
// comes back a different board.
test('the head bump is the low end, and its stock is the machine', () => {
  const low = (tapeBump: number) => {
    const { l } = render(
      {
        ...SILENT,
        oscLevel: 0.5,
        oscAHz: 38,
        oscShape: 1,
        ...STEADY,
        tapeMix: 1,
        tapeSpeed: 1,
        tapeHyst: 0,
        tapeBump,
      },
      2,
    )
    return bin(l.subarray(SR), 38)
  }
  expect(low(0)).toBeLessThan(low(0.5))
  expect(low(0.5)).toBeLessThan(low(1.5))
  expect(DEFAULT_CONTROLS.tapeBump).toBe(0.5)
})

// A head bump is not one peak on a flat line. Flux comes back round the core a
// second time, so the response ripples on up the band with the next one
// inverted — the lift at the bottom is paid for by a scoop above it. Where both
// of them sit is the speed's business and not the knob's, so at 3¾ ips the
// scoop lands on the frequency 7½ ips was lifting.
test('the head bump is a lift and the scoop that pays for it', () => {
  const at = (hz: number, tapeSpeed: number) =>
    response(hz, { tapeSpeed, tapeBump: 1 })
  expect(at(40, 1)).toBeGreaterThan(3)
  expect(at(100, 1)).toBeLessThan(-1)
  expect(Math.abs(at(500, 1))).toBeLessThan(0.5)
  expect(at(57, 1)).toBeGreaterThan(2)
  expect(at(57, 0)).toBeLessThan(-0.5)
})

// Remanence is what the medium keeps. The bloom is not a reading of the note
// being played, then — it comes up with the loud part and is still lit for the
// quiet one behind it, and lets go over a breath rather than over a cycle.
// Tracked at one speed both ways it sat near the average of a rectified wave
// instead, which is a knob that pumps in and out of every hit.
test('the bloom hangs on after the passage that lit it', () => {
  const board: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0,
    sampleLevel: 1,
    sampleMode: 1,
    ...STEADY,
    tapeMix: 1,
    tapeHyst: 1,
    tapeDrive: 6,
  }
  // A loud third of a second, then a quiet tail of the same tone.
  const h2 = (loud: number, from: number, to: number) => {
    const out = renderBender(board, 1.2, b => {
      const buf = sine(220, 1.2, 1)
      for (let i = 0; i < buf.length; i++)
        buf[i] = buf[i]! * (i < 0.3 * SR ? loud : 0.12)
      b.sampler.setBuffer(buf)
    })
    const w = out.subarray(Math.round(from * SR), Math.round(to * SR))
    return db(bin(w, 440) / bin(w, 220))
  }
  const cold = h2(0.12, 0.32, 0.42)
  expect(h2(0.9, 0.32, 0.42)).toBeGreaterThan(cold + 3)
  expect(h2(0.9, 0.6, 0.9)).toBeCloseTo(h2(0.12, 0.6, 0.9), 1)
})

// Nothing here plays a screech. The friction curve has the wrong slope on it,
// which is a damping term that is negative while the span is nearly still, and
// a resonator wired that way takes off on its own — so what comes out is a
// limit cycle rather than a sample, and the note it lands on is the speed's.
test('a machine with nothing playing screams at the note the span holds', () => {
  const sung = (tapeSpeed: number) => {
    const out = renderBender(
      { ...SILENT, ...STEADY, tapeMix: 1, tapeSqueal: 1, tapeSpeed },
      4,
    ).subarray(2 * SR)
    let best = 0
    let hz = 0
    for (let f = 600; f < 6000; f += 25)
      if (bin(out, f) > best) {
        best = bin(out, f)
        hz = f
      }
    return hz
  }
  // Within a tenth of the note the span holds, because tension wanders it by a
  // few percent and a squeal that sat dead on a frequency would be an oscillator.
  for (const [tapeSpeed, want] of [
    [0, 1500],
    [1, 2400],
    [2, 3400],
  ] as const) {
    expect(sung(tapeSpeed) / want, `${want} Hz`).toBeGreaterThan(0.89)
    expect(sung(tapeSpeed) / want, `${want} Hz`).toBeLessThan(1.11)
  }
  expect(rms(renderBender({ ...SILENT, ...STEADY, tapeMix: 1 }, 4))).toBe(0)
})

// The other way it gets out. What is squealing is the tape's own speed past the
// head, so everything already recorded wobbles at the same rate — which is why
// a machine doing this sounds wrong on material with none of it in it, and why
// turning the tape down is the only knob that makes it go away.
test('the squeal wobbles whatever is already on the tape', () => {
  const board: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0,
    sampleLevel: 1,
    ...STEADY,
    tapeMix: 1,
    tapeSpeed: 1,
  }
  // Read as a band rather than as a bin: tension wanders the squeal by a few
  // percent, so its sidebands smear over a couple of hundred Hz and one bin
  // reports where the note happened to sit for that take. The band is 2.4 kHz
  // above the kilocycle and clear of its harmonics either side.
  const sideband = (tapeSqueal: number) => {
    const out = renderBender({ ...board, tapeSqueal }, 8, b =>
      b.sampler.setBuffer(sine(1000, 1, 0.35)),
    ).subarray(2 * SR)
    let band = 0
    for (let f = 3200; f <= 3600; f += 25) band += bin(out, f) ** 2
    return db(Math.sqrt(band) / bin(out, 1000))
  }
  expect(sideband(1)).toBeGreaterThan(-35)
  expect(sideband(0)).toBeLessThan(-100)
})

// Scrape flutter and the squeal are one mechanism. The free span between the
// guides is a resonator whose damping falls as the tape starts to move: under
// the line, friction rattles it and what you get is a band of grain around its
// note; over the line, the damping has gone negative and the same span takes
// off. So the flutter knob's grain sits where the squeal's note sits, and moves
// down the band with speed the way that note does — and a healthy span still
// only modulates the tape, so a machine with nothing playing stays silent
// however far flutter is wound.
test('flutter is the same span the squeal is, below its threshold', () => {
  const board: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0,
    sampleLevel: 1,
    tapeMix: 1,
    tapeHiss: 0,
    tapeWow: 0,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(1000, 1, 0.35))
  // Energy in a band, against the tone that is carrying it.
  const at = (over: Partial<Controls>, centre: number) => {
    const out = renderBender({ ...board, ...over }, 8, load).subarray(2 * SR)
    let band = 0
    for (let f = centre - 200; f <= centre + 200; f += 25)
      band += bin(out, f) ** 2
    return db(Math.sqrt(band) / bin(out, 1000))
  }
  // At 7½ ips the span sings at 2.4 kHz, so the grain lands 2.4 kHz off the
  // kilocycle. It comes up with the knob and is nothing at all without it.
  const grain = (tapeFlutter: number) => at({ tapeFlutter }, 3400)
  expect(grain(0)).toBeLessThan(-100)
  expect(grain(1)).toBeGreaterThan(grain(0.25) + 6)
  expect(grain(1)).toBeGreaterThan(-55)

  // And the whole band moves with the speed, because the span is what tightens.
  const tilt = (tapeSpeed: number) =>
    at({ tapeFlutter: 1, tapeSpeed }, 2500) -
    at({ tapeFlutter: 1, tapeSpeed }, 4400)
  expect(tilt(0)).toBeGreaterThan(tilt(2) + 8)

  // A span that is only resonating does not carry across a studio.
  expect(
    rms(renderBender({ ...board, sampleLevel: 0, tapeFlutter: 1 }, 3)),
  ).toBe(0)
})

// A tape that is only starting to go off squeals in waves, because whether the
// span takes off at all is tension's call and the drift takes minutes over it.
// Wound all the way up the tape bites hard enough that tension can no longer
// talk it out of it, and the machine simply screams.
test('a squeal comes and goes until the knob stops letting it', () => {
  // Twenty-four seconds because whether the span takes off is tension's call
  // and tension turns over about once a second: six seconds is four or five
  // draws off a random process, and a take that spent all of them on one side
  // reads as a knob that does nothing.
  const secs = 24
  const spread = (tapeSqueal: number) => {
    const out = renderBender(
      { ...SILENT, ...STEADY, tapeMix: 1, tapeSqueal },
      secs,
    )
    const peaks: number[] = []
    for (let t = 0; t + 0.5 <= secs; t += 0.5) {
      const w = out.subarray(t * SR, (t + 0.5) * SR)
      peaks.push(w.reduce((a, v) => Math.max(a, Math.abs(v)), 0))
    }
    return db(Math.max(...peaks) / Math.min(...peaks))
  }
  expect(spread(0.25)).toBeGreaterThan(25)
  expect(spread(1)).toBeLessThan(15)
})

test('tape off leaves the board bit-identical', () => {
  const look: Partial<Controls> = { chipLevel: 0.6, dlyMix: 0.3, revMix: 0.2 }
  expect(render({ ...look, tapeMix: 0 }, 1).l).toEqual(render(look, 1).l)
})

// A heap of bent hardware on the floor, seen from above, drawn as flat SVG
// shapes. One seed always draws the same heap.
export const PILE_WIDTH = 1200
export const PILE_HEIGHT = 540

const C = {
  red: '#e8553d',
  teal: '#2fb5a8',
  mustard: '#e6b43c',
  pink: '#e87aa6',
  blue: '#4a7fd6',
  cream: '#efe6cf',
  white: '#f2f2f5',
  black: '#1b1b20',
  grey: '#8b8d96',
  steel: '#b9bcc6',
  green: '#2f7d4f',
  trace: '#4fa874',
  copper: '#c98a4b',
  gold: '#d9b45a',
  tape: '#6b4630',
  ink: '#000000',
  tan: '#d9b98a',
  film: '#6fa8c9',
  brown: '#8a5a2b',
  orange: '#e0883d',
  violet: '#8a5cc4',
  plastic: '#2b2b31',
  screen: '#7fe3b0',
  rim: '#25252c',
  well: '#18181d',
  cone: '#33333c',
}

const WIRES = [C.red, C.mustard, C.teal, C.pink, C.blue, C.white, C.grey]
const PATCH = [C.blue, C.red, C.teal, C.mustard, C.pink, C.plastic]
const BANDS = [
  C.brown,
  C.red,
  C.orange,
  C.mustard,
  C.green,
  C.blue,
  C.violet,
  C.grey,
  C.white,
]
const BODIES = [C.teal, C.mustard, C.pink, C.blue]
const TAU = Math.PI * 2

type Rng = () => number

const seeded =
  (seed: number): Rng =>
  () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

const n = (x: number) => Math.round(x * 10) / 10
const mix = (a: string, b: string, k: number) =>
  '#' +
  [1, 3, 5]
    .map(i =>
      Math.round(
        parseInt(a.slice(i, i + 2), 16) * (1 - k) +
          parseInt(b.slice(i, i + 2), 16) * k,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
const between = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo)
const pick = <T>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!
const gauss = (r: Rng) =>
  Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(TAU * r())

interface Hull {
  x: number
  y: number
  w: number
  h: number
  rx: number
}

interface Thing {
  hull: Hull
  body: string
  weight: number
  boost?: number
}

const hull = (
  x: number,
  y: number,
  w: number,
  h: number,
  rx: number,
): Hull => ({ x, y, w, h, rx })

const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  rx = 0,
  extra = '',
) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`

const circle = (cx: number, cy: number, r: number, fill: string, extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`

const knobAt = (x: number, y: number, r: number, fill: string, angle: number) =>
  circle(x, y, r, fill, `stroke="${C.black}" stroke-width="1.5"`) +
  `<line x1="${x}" y1="${y}" x2="${n(x + Math.cos(angle) * r * 0.85)}" y2="${n(y + Math.sin(angle) * r * 0.85)}" stroke="${C.black}" stroke-width="2" stroke-linecap="round"/>`

const keyboard = (r: Rng): Thing => {
  const body = pick(r, BODIES)
  let s = rect(-130, -58, 260, 116, body, 10)
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 5; col++)
      s += circle(-112 + col * 11, -34 + row * 11, 3, C.black)
  s += rect(-50, -48, 60, 8, C.cream, 2)
  for (let k = 0; k < 8; k++)
    s += rect(
      -50 + k * 17,
      0,
      17,
      50,
      C.cream,
      1,
      `stroke="${C.black}" stroke-width="0.8"`,
    )
  for (const k of [1, 2, 4, 5, 6])
    s += rect(-50 + k * 17 - 5, 0, 10, 28, C.black, 1)
  for (let k = 0; k < 3; k++)
    s += knobAt(40 + k * 26, -36, 7, C.steel, between(r, 0, TAU))
  return { hull: hull(-130, -58, 260, 116, 10), body: s, weight: 3 }
}

const drums = (r: Rng): Thing => {
  const body = pick(r, BODIES)
  let s = rect(-100, -75, 200, 150, body, 12)
  s += rect(-82, -61, 70, 22, C.screen, 3)
  s += knobAt(30, -50, 9, C.steel, between(r, 0, TAU))
  s += knobAt(62, -50, 9, C.steel, between(r, 0, TAU))
  const pads = [C.pink, C.mustard, C.teal, C.white]
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++)
      s += rect(
        -82 + col * 42,
        -24 + row * 34,
        34,
        28,
        pads[(row + col) % 4]!,
        4,
        `stroke="${C.black}" stroke-width="1"`,
      )
  return { hull: hull(-100, -75, 200, 150, 12), body: s, weight: 3 }
}

const footswitch = (x: number, y: number, r: number) =>
  circle(x, y, r, C.steel, `stroke="${C.black}" stroke-width="1.5"`) +
  circle(x, y, r * 0.6, C.grey)

const lamp = (x: number, y: number, color: string) =>
  circle(x, y, 3.5, color, `stroke="${C.black}" stroke-width="1"`)

const pedalColors = [C.blue, C.teal, C.mustard, C.orange, C.pink, C.grey]

const stomp = (r: Rng): Thing => {
  const body = pick(r, [C.blue, C.teal, C.grey, C.mustard])
  let s = rect(-45, -70, 90, 140, body, 9)
  s += rect(-50, -30, 5, 12, C.steel) + rect(45, -30, 5, 12, C.steel)
  s += knobAt(-22, -46, 9, C.steel, between(r, 0, TAU))
  s += knobAt(22, -46, 9, C.steel, between(r, 0, TAU))
  s += circle(0, -26, 4, C.red)
  s += rect(-32, -14, 64, 30, C.cream, 3)
  s += rect(-24, -7, 48, 4, C.black, 1) + rect(-24, 3, 30, 4, C.black, 1)
  s += circle(0, 44, 15, C.steel, `stroke="${C.black}" stroke-width="1.5"`)
  s += circle(0, 44, 9, C.grey)
  return { hull: hull(-45, -70, 90, 140, 9), body: s, weight: 2 }
}

const compact = (r: Rng): Thing => {
  let s = rect(-30, -58, 60, 116, pick(r, pedalColors), 6)
  s += knobAt(-13, -42, 6.5, C.steel, between(r, 0, TAU))
  s += knobAt(13, -42, 6.5, C.steel, between(r, 0, TAU))
  s += lamp(0, -26, C.red)
  s += rect(-24, -18, 48, 20, C.cream, 3) + rect(-18, -11, 36, 4, C.black, 1)
  s += rect(-26, 10, 52, 40, C.well, 5)
  for (let i = 0; i < 4; i++) s += rect(-22, 16 + i * 8, 44, 2, C.cone, 1)
  s += rect(-34, -34, 4, 10, C.steel) + rect(30, -34, 4, 10, C.steel)
  return { hull: hull(-30, -58, 60, 116, 6), body: s, weight: 2 }
}

const wideBox = (r: Rng): Thing => {
  let s = rect(
    -70,
    -55,
    140,
    110,
    pick(r, [C.cream, C.red, C.grey, C.mustard]),
    8,
  )
  for (const x of [-40, 0, 40])
    s += knobAt(x, -28, 11, C.black, between(r, 0, TAU))
  s += rect(-52, -4, 104, 16, C.white, 2) + rect(-44, 2, 60, 4, C.black, 1)
  s += footswitch(0, 34, 14) + lamp(-52, 34, C.red)
  for (const [x, y] of [
    [-63, -48],
    [63, -48],
    [-63, 48],
    [63, 48],
  ] as const)
    s += circle(x, y, 2.5, C.grey)
  return { hull: hull(-70, -55, 140, 110, 8), body: s, weight: 3 }
}

const equalizer = (r: Rng): Thing => {
  let s = rect(-62, -52, 124, 104, pick(r, [C.grey, C.mustard, C.teal]), 6)
  for (let i = 0; i < 7; i++) {
    const x = -45 + i * 15
    s += rect(x - 2, -38, 4, 52, C.black, 2)
    s += rect(x - 6, between(r, -36, 8), 12, 6, C.cream, 1)
  }
  s += footswitch(0, 36, 9) + lamp(46, -46, C.red)
  return { hull: hull(-62, -52, 124, 104, 6), body: s, weight: 3 }
}

const fuzz = (r: Rng): Thing => {
  const body = pick(r, [C.steel, C.red, C.blue])
  let s = circle(0, 0, 44, body, `stroke="${C.grey}" stroke-width="2"`)
  s += knobAt(-17, -14, 9, C.black, between(r, 0, TAU))
  s += knobAt(17, -14, 9, C.black, between(r, 0, TAU))
  s += footswitch(0, 26, 10)
  return { hull: hull(-44, -44, 88, 88, 44), body: s, weight: 2 }
}

const wah = (r: Rng): Thing => {
  const body = pick(r, [C.steel, C.red, C.mustard])
  let s = `<path d="M-24,-80 L24,-80 L34,80 L-34,80 Z" fill="${body}" stroke="${body}" stroke-width="8" stroke-linejoin="round"/>`
  s += rect(-21, -64, 42, 126, C.black, 4)
  for (let i = 0; i < 10; i++) s += rect(-21, -60 + i * 12.5, 42, 4, C.cone, 1)
  s += circle(-27, -76, 2.5, C.grey) + circle(27, -76, 2.5, C.grey)
  return { hull: hull(-38, -84, 76, 168, 10), body: s, weight: 3 }
}

const expression = (r: Rng): Thing => {
  const body = pick(r, [C.blue, C.grey, C.teal])
  let s = rect(-35, -75, 70, 150, body, 8)
  s += rect(-28, -66, 56, 102, mix(body, C.white, 0.15), 6)
  for (let i = 0; i < 7; i++) s += rect(-28, -58 + i * 14, 56, 3, C.black, 1)
  s += knobAt(-14, 56, 6.5, C.steel, between(r, 0, TAU)) + lamp(14, 56, C.green)
  return { hull: hull(-35, -75, 70, 150, 8), body: s, weight: 3 }
}

const tuner = (r: Rng): Thing => {
  let s = rect(-28, -45, 56, 90, pick(r, [C.teal, C.mustard, C.pink]), 6)
  s += rect(-21, -36, 42, 28, C.screen, 3)
  for (let i = -3; i <= 3; i++) s += rect(i * 5 - 0.5, -14, 1, 4, C.black)
  const lean = between(r, -0.5, 0.5)
  s += `<line x1="0" y1="-12" x2="${n(Math.sin(lean) * 16)}" y2="${n(-12 - Math.cos(lean) * 16)}" stroke="${C.black}" stroke-width="1.6" stroke-linecap="round"/>`
  s += lamp(-8, 0, C.red) + lamp(8, 0, C.green)
  s += footswitch(0, 24, 12)
  return { hull: hull(-28, -45, 56, 90, 6), body: s, weight: 2 }
}

const cassette = (r: Rng): Thing => {
  const body = pick(r, [C.cream, C.grey, C.mustard, C.teal])
  let s = rect(-65, -42, 130, 84, body, 6)
  s += rect(-55, -34, 110, 44, C.white, 3)
  s += rect(-48, -26, 96, 3, C.grey) + rect(-48, -19, 70, 3, C.grey)
  s += rect(-48, -6, 96, 22, C.black, 11)
  s += circle(-30, 5, 9, C.cream) + circle(30, 5, 9, C.cream)
  s += circle(-30, 5, 3.5, C.black) + circle(30, 5, 3.5, C.black)
  s += `<polygon points="-40,42 -32,24 32,24 40,42" fill="${C.plastic}"/>`
  return { hull: hull(-65, -42, 130, 84, 6), body: s, weight: 2 }
}

const battery = (r: Rng): Thing => {
  let s = rect(-20, -34, 40, 68, pick(r, [C.black, C.plastic, C.blue]), 3)
  s += rect(-20, -8, 40, 18, C.copper)
  s += rect(-20, -34, 40, 14, C.steel, 3)
  s += circle(-8, -27, 5, C.steel, `stroke="${C.grey}" stroke-width="1.5"`)
  s += circle(8, -27, 5, C.steel, `stroke="${C.grey}" stroke-width="1.5"`)
  return { hull: hull(-20, -34, 40, 68, 3), body: s, weight: 1, boost: 1.1 }
}

const board = (r: Rng): Thing => {
  let s = rect(-75, -50, 150, 100, C.green, 4)
  for (let i = 0; i < 7; i++) {
    const x = between(r, -65, 65)
    const y = between(r, -40, 40)
    s += `<polyline points="${n(x)},${n(y)} ${n(x + between(r, -40, 40))},${n(y)} ${n(x + between(r, -40, 40))},${n(y + between(r, -30, 30))}" fill="none" stroke="${C.trace}" stroke-width="1.8" stroke-linejoin="round"/>`
  }
  s += rect(-50, -28, 44, 20, C.black, 2) + rect(10, 6, 52, 22, C.black, 2)
  for (let i = 0; i < 14; i++)
    s += circle(n(between(r, -68, 68)), n(between(r, -43, 43)), 2.6, C.gold)
  s += rect(-60, 28, 4, 14, C.copper) + rect(-52, 28, 4, 14, C.red)
  s += circle(-66, -42, 3, C.black) + circle(66, 42, 3, C.black)
  return { hull: hull(-75, -50, 150, 100, 4), body: s, weight: 2 }
}

const chip = (): Thing => {
  let s = rect(-25, -11, 50, 22, C.black, 2) + circle(-19, 0, 3, C.grey)
  for (let i = 0; i < 6; i++)
    s +=
      rect(-22 + i * 8, -15, 3, 4, C.steel) +
      rect(-22 + i * 8, 11, 3, 4, C.steel)
  return { hull: hull(-25, -13, 50, 26, 2), body: s, weight: 0, boost: 1.35 }
}

const knob = (r: Rng): Thing => ({
  hull: hull(-13, -13, 26, 26, 13),
  body: knobAt(
    0,
    0,
    13,
    pick(r, [C.cream, C.red, C.steel, C.mustard]),
    between(r, 0, TAU),
  ),
  weight: 0,
  boost: 1.5,
})

const speaker = (): Thing => ({
  hull: hull(-48, -48, 96, 96, 48),
  body:
    circle(0, 0, 48, C.rim) +
    circle(0, 0, 40, C.well, `stroke="${C.steel}" stroke-width="3"`) +
    circle(0, 0, 26, C.cone) +
    circle(0, 0, 9, C.well) +
    [
      [-38, -38],
      [38, -38],
      [-38, 38],
      [38, 38],
    ]
      .map(([x, y]) => circle(x!, y!, 2.5, C.grey))
      .join(''),
  weight: 3,
})

const screwdriver = (r: Rng): Thing => {
  const handle = pick(r, [C.mustard, C.red, C.blue])
  let s = rect(-50, -8, 46, 16, handle, 6)
  for (let i = 0; i < 4; i++)
    s += rect(-44 + i * 9, -8, 3, 16, C.black, 0, 'opacity="0.35"')
  s += rect(-4, -2, 70, 4, C.steel) + rect(66, -3, 8, 6, C.grey)
  return { hull: hull(-50, -8, 124, 16, 6), body: s, weight: 0 }
}

const spool = (): Thing => {
  let s =
    circle(0, 0, 20, C.black) +
    circle(0, 0, 14, C.tape) +
    circle(0, 0, 5, C.cream)
  s += circle(0, 0, 2, C.black)
  s += `<line x1="0" y1="-14" x2="0" y2="-20" stroke="${C.cream}" stroke-width="2"/>`
  return { hull: hull(-20, -20, 40, 40, 20), body: s, weight: 0, boost: 1.4 }
}

const lead = (x1: number, y1: number, x2: number, y2: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.steel}" stroke-width="2" stroke-linecap="round"/>`

const resistor = (r: Rng): Thing => {
  let s = lead(-42, 0, -20, 0) + lead(20, 0, 42, 0)
  s += rect(-20, -7, 40, 14, pick(r, [C.tan, C.film]), 7)
  for (const [x, color] of [
    [-13, pick(r, BANDS)],
    [-6, pick(r, BANDS)],
    [1, pick(r, BANDS)],
    [11, C.gold],
  ] as const)
    s += rect(x, -7, 4, 14, color)
  return { hull: hull(-20, -7, 40, 14, 7), body: s, weight: 0, boost: 1.25 }
}

const electrolytic = (r: Rng): Thing => {
  const body = pick(r, [
    C.plastic,
    mix(C.blue, C.ink, 0.45),
    mix(C.green, C.ink, 0.3),
  ])
  let s = circle(0, 0, 16, body)
  s += `<path d="M-9,-13 A16,16 0 0 0 -9,13 L-4,11 A11.7,11.7 0 0 1 -4,-11 Z" fill="${C.steel}"/>`
  const vent = `stroke="${mix(body, C.white, 0.3)}" stroke-width="1.2"`
  s += `<line x1="1" y1="0" x2="11" y2="0" ${vent}/><line x1="6" y1="-5" x2="6" y2="5" ${vent}/>`
  return { hull: hull(-16, -16, 32, 32, 16), body: s, weight: 0, boost: 1.2 }
}

const disc = (): Thing => {
  let s = lead(-4, 6, -4, 24) + lead(4, 6, 4, 24)
  s += circle(0, 0, 10, C.orange)
  s += rect(-5, -1, 10, 2, mix(C.orange, C.ink, 0.5), 1)
  return { hull: hull(-10, -10, 20, 20, 10), body: s, weight: 0, boost: 1.3 }
}

const led = (r: Rng): Thing => {
  const color = pick(r, [C.red, C.mustard, C.green, C.teal])
  let s = lead(-3, 10, -3, 28) + lead(3, 10, 3, 22)
  s += circle(0, 0, 11, mix(color, C.ink, 0.35))
  s += circle(0, 0, 8.5, color)
  s += circle(-3, -3, 2.5, mix(color, C.white, 0.6))
  return { hull: hull(-11, -11, 22, 22, 11), body: s, weight: 0, boost: 1.3 }
}

const diode = (): Thing => {
  let s = lead(-30, 0, -12, 0) + lead(12, 0, 30, 0)
  s += rect(-12, -4.5, 24, 9, C.orange, 4.5)
  s += rect(5, -4.5, 4, 9, C.black)
  return { hull: hull(-12, -4.5, 24, 9, 4.5), body: s, weight: 0, boost: 1.4 }
}

const transistor = (): Thing => {
  let s = lead(-6, 8, -6, 26) + lead(0, 8, 0, 26) + lead(6, 8, 6, 26)
  s += `<path d="M-10,8 L-10,-2 A10,10 0 0 1 10,-2 L10,8 Z" fill="${C.black}"/>`
  s += rect(-5, 0, 10, 2, C.grey, 1)
  return { hull: hull(-10, -12, 20, 20, 6), body: s, weight: 0, boost: 1.3 }
}

const trimmer = (r: Rng): Thing => {
  const angle = between(r, 0, TAU)
  let s =
    rect(-8, 14, 3, 6, C.steel) +
    rect(-1.5, 14, 3, 6, C.steel) +
    rect(5, 14, 3, 6, C.steel)
  s += rect(-14, -14, 28, 28, C.blue, 3)
  s += circle(0, 0, 8, C.gold, `stroke="${C.black}" stroke-width="1.2"`)
  s += `<line x1="${n(Math.cos(angle) * -6)}" y1="${n(Math.sin(angle) * -6)}" x2="${n(Math.cos(angle) * 6)}" y2="${n(Math.sin(angle) * 6)}" stroke="${C.black}" stroke-width="2" stroke-linecap="round"/>`
  return { hull: hull(-14, -14, 28, 28, 3), body: s, weight: 0, boost: 1.2 }
}

const pot = (r: Rng): Thing => {
  const angle = between(r, 0, TAU)
  let s =
    rect(-9, 12, 4, 9, C.copper) +
    rect(-2, 12, 4, 9, C.copper) +
    rect(5, 12, 4, 9, C.copper)
  s += circle(0, 0, 15, C.cone, `stroke="${C.grey}" stroke-width="1.5"`)
  s += circle(0, 0, 9, C.rim)
  s += circle(0, 0, 5, C.steel)
  s += `<line x1="${n(Math.cos(angle) * -5)}" y1="${n(Math.sin(angle) * -5)}" x2="${n(Math.cos(angle) * 5)}" y2="${n(Math.sin(angle) * 5)}" stroke="${C.black}" stroke-width="1.6"/>`
  return { hull: hull(-15, -15, 30, 30, 15), body: s, weight: 0, boost: 1.2 }
}

interface Spot {
  x: number
  y: number
  r: number
}

const place = (
  r: Rng,
  taken: Spot[],
  tries: number,
  size: number,
  spread: number,
): Spot => {
  let best: Spot = { x: 0, y: 0, r: size }
  let room = -Infinity
  for (let i = 0; i < tries; i++) {
    const x = Math.min(
      PILE_WIDTH - 40,
      Math.max(40, PILE_WIDTH / 2 + gauss(r) * 250 * spread),
    )
    const y = Math.min(
      PILE_HEIGHT - 40,
      Math.max(40, PILE_HEIGHT / 2 + gauss(r) * 105 * spread),
    )
    const gap = Math.min(
      ...taken.map(t => Math.hypot(t.x - x, t.y - y) - t.r - size),
      Infinity,
    )
    if (gap > room) {
      room = gap
      best = { x, y, r: size }
    }
  }
  taken.push(best)
  return best
}

const at = (spot: Spot, turn: number, scale: number, inner: string) =>
  `<g transform="translate(${n(spot.x)} ${n(spot.y)}) rotate(${n(turn)}) scale(${n(scale)})">${inner}</g>`

const drawThing = (thing: Thing, spot: Spot, turn: number, scale: number) => {
  const { x, y, w, h, rx } = thing.hull
  return at(
    spot,
    turn,
    scale,
    `<g transform="translate(5 7)" opacity="0.4">${rect(x, y, w, h, C.ink, rx)}</g>${thing.body}`,
  )
}

const jaw = (sign: number, fill: string) =>
  `<polygon points="${[
    [6, -5],
    [38, -11],
    [38, -3],
    [35, -5.4],
    [32, -3.2],
    [29, -5],
    [26, -2.8],
    [23, -4.2],
    [6, -1.5],
  ]
    .map(([px, py]) => `${px},${py! * sign}`)
    .join(' ')}" fill="${fill}"/>`

const alligator = (x: number, y: number, angle: number, color: string) => {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})">` +
    jaw(1, C.steel) +
    jaw(-1, C.grey) +
    rect(0, -4.5, 8, 9, C.steel, 1) +
    rect(-22, -6.5, 22, 13, color, 4) +
    rect(
      -22,
      -6.5,
      22,
      13,
      'none',
      4,
      `stroke="${C.ink}" stroke-opacity="0.35"`,
    ) +
    circle(16, 0, 2, C.black) +
    `</g>`
  )
}

const jack = (x: number, y: number, angle: number, color: string) =>
  `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})">` +
  rect(-24, -7, 24, 14, C.plastic, 4) +
  rect(-24, -7, 9, 14, color, 4) +
  rect(0, -6, 16, 12, C.steel, 2) +
  rect(16, -3.5, 3, 7, C.black) +
  rect(19, -3.5, 8, 7, C.steel, 1) +
  rect(27, -3.5, 2, 7, C.black) +
  rect(29, -3, 8, 6, C.steel, 3) +
  `</g>`

const fray = (r: Rng, x: number, y: number, angle: number, width: number) => {
  let s = rect(0, -width / 2 + 0.6, 7, width - 1.2, C.copper, 1)
  for (let i = 0; i < 7; i++) {
    const spread = (i - 3) * between(r, 3, 4.5)
    const reach = between(r, 12, 22)
    const bow = between(r, -5, 5)
    s += `<path d="M7,${n((i - 3) * 0.3)}Q${n(7 + reach / 2)},${n(spread / 2 + bow)} ${n(7 + reach)},${n(spread)}" fill="none" stroke="${i % 3 ? C.copper : C.gold}" stroke-width="1.1" stroke-linecap="round"/>`
  }
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})">${s}</g>`
}

type CableKind = 'alligator' | 'patch' | 'frayed' | 'tape'

type Pt = readonly [number, number]

const inside = (v: number, size: number) => {
  const bounced = v < 30 ? 60 - v : v > size - 30 ? 2 * (size - 30) - v : v
  return Math.min(size - 30, Math.max(30, bounced))
}

const waypoints = (r: Rng, long: boolean): Pt[] => {
  const x0 = between(r, 60, PILE_WIDTH - 60)
  const y0 = between(r, 60, PILE_HEIGHT - 60)
  const heading =
    Math.atan2(PILE_HEIGHT / 2 - y0, PILE_WIDTH / 2 - x0) +
    between(r, -1.2, 1.2)
  const length = long ? between(r, 650, 1100) : between(r, 220, 460)
  const stops = long ? 6 : 3
  const curl = long ? 0.22 : 0.08
  const ux = Math.cos(heading)
  const uy = Math.sin(heading)
  const points: Pt[] = [[x0, y0]]
  let sway = between(r, -60, 60)
  for (let i = 1; i < stops; i++) {
    const reach = (length * i) / (stops - 1) + between(r, -20, 20)
    sway = Math.max(-120, Math.min(120, sway + between(r, -55, 55)))
    const x = x0 + ux * reach - uy * sway
    const y = y0 + uy * reach * 0.6 + ux * sway * 0.6
    if (i < stops - 1 && r() < curl) {
      const radius = between(r, 34, 58)
      const cx = x + ux * radius
      const cy = y + uy * radius
      for (const turn of [Math.PI, 1.5 * Math.PI, 0, 0.5 * Math.PI]) {
        const a = heading + turn
        points.push([
          inside(cx + Math.cos(a) * radius, PILE_WIDTH),
          inside(cy + Math.sin(a) * radius, PILE_HEIGHT),
        ])
      }
    } else points.push([inside(x, PILE_WIDTH), inside(y, PILE_HEIGHT)])
  }
  return points
}

const smooth = (p: Pt[]) => {
  let d = `M${n(p[0]![0])} ${n(p[0]![1])}`
  let first: Pt = p[0]!
  let last: Pt = p[0]!
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i]!
    const b = p[i]!
    const c = p[i + 1]!
    const e = p[i + 2] ?? c
    const c1: Pt = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6]
    const c2: Pt = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6]
    if (i === 0) first = c1
    last = c2
    d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(c[0])} ${n(c[1])}`
  }
  return { d, first, last }
}

const wire = (r: Rng, kind: CableKind, long = false) => {
  const points = waypoints(r, long || kind === 'tape')
  const { d, first, last } = smooth(points)
  const [x0, y0] = points[0]!
  const [x3, y3] = points.at(-1)!
  const color =
    kind === 'tape' ? C.tape : pick(r, kind === 'patch' ? PATCH : WIRES)
  const width =
    kind === 'tape'
      ? 2.5
      : kind === 'patch'
        ? between(r, 4.5, 5.5)
        : between(r, 2.8, 3.6)
  const tail = (Math.atan2(y3 - last[1], x3 - last[0]) * 180) / Math.PI
  const head = (Math.atan2(y0 - first[1], x0 - first[0]) * 180) / Math.PI
  const ends = (draw: (x: number, y: number, angle: number) => string) =>
    draw(x3, y3, tail) + draw(x0, y0, head)
  const stroke = (c: string, w: number, extra = '') =>
    `<path d="${d}" fill="none" stroke="${c}" stroke-width="${n(w)}" stroke-linecap="round" ${extra}/>`
  let tips = ''
  if (kind === 'alligator') tips = ends((x, y, a) => alligator(x, y, a, color))
  if (kind === 'patch') tips = ends((x, y, a) => jack(x, y, a, color))
  if (kind === 'frayed') tips = ends((x, y, a) => fray(r, x, y, a, width))
  return (
    `<g transform="translate(4 6)" opacity="0.4">${stroke(C.ink, width + 1.6)}</g>` +
    stroke(mix(color, C.ink, 0.3), width + 1.2) +
    stroke(color, width) +
    stroke(mix(color, C.white, 0.28), width * 0.22) +
    tips
  )
}

const floor = () => {
  let s = rect(0, 0, PILE_WIDTH, PILE_HEIGHT, 'var(--surface)')
  const seam = 'stroke="var(--border-faint)" stroke-width="2"'
  for (let y = 0; y <= PILE_HEIGHT; y += 135)
    s += `<line x1="0" y1="${y}" x2="${PILE_WIDTH}" y2="${y}" ${seam}/>`
  for (let row = 0; row < 4; row++)
    for (let x = row % 2 ? 300 : 0; x <= PILE_WIDTH; x += 600)
      s += `<line x1="${x}" y1="${row * 135}" x2="${x}" y2="${row * 135 + 135}" ${seam}/>`
  return s
}

export const pile = (seed = 3): string => {
  const r = seeded(seed)
  const taken: Spot[] = []
  const heap: { weight: number; svg: string }[] = []

  const toss = (
    make: (r: Rng) => Thing,
    count: number,
    tries: number,
    spread = 1,
  ) => {
    for (let i = 0; i < count; i++) {
      const thing = make(r)
      const scale = between(r, 0.85, 1.12) * (thing.boost ?? 1)
      const size = (Math.hypot(thing.hull.w, thing.hull.h) / 2) * 0.45 * scale
      const spot = place(r, taken, tries, size, spread)
      heap.push({
        weight: thing.weight + r() * 0.9,
        svg: drawThing(thing, spot, between(r, -180, 180), scale),
      })
    }
  }

  toss(keyboard, 2, 14)
  toss(drums, 1, 14)
  toss(speaker, 1, 10)
  toss(stomp, 2, 10)
  toss(compact, 1, 10)
  toss(wideBox, 1, 10)
  toss(equalizer, 1, 10)
  toss(fuzz, 1, 10)
  toss(wah, 1, 10)
  toss(expression, 1, 10)
  toss(tuner, 1, 10)
  toss(cassette, 2, 8)
  toss(board, 2, 8)
  toss(battery, 4, 4)
  toss(spool, 2, 4)
  toss(chip, 5, 3)
  toss(knob, 3, 3)
  toss(resistor, 7, 3, 1.5)
  toss(electrolytic, 3, 3, 1.3)
  toss(disc, 2, 3, 1.4)
  toss(led, 3, 3, 1.4)
  toss(diode, 3, 3, 1.5)
  toss(transistor, 3, 3, 1.4)
  toss(trimmer, 2, 3, 1.3)
  toss(pot, 2, 3, 1.3)
  toss(screwdriver, 1, 4)

  const sorted = heap.toSorted((a, b) => b.weight - a.weight).map(h => h.svg)
  const split = Math.ceil(sorted.length * 0.55)
  const kinds: [CableKind, boolean][] = [
    ['alligator', false],
    ['patch', true],
    ['frayed', false],
    ['alligator', false],
    ['patch', false],
    ['frayed', true],
    ['alligator', false],
    ['patch', false],
    ['frayed', false],
    ['alligator', true],
    ['patch', false],
    ['frayed', false],
    ['alligator', false],
    ['patch', true],
    ['frayed', true],
  ]
  const cables = kinds.map(([kind, long]) => wire(r, kind, long))
  const tapes = Array.from({ length: 2 }, () => wire(r, 'tape'))

  return (
    `<svg viewBox="0 0 ${PILE_WIDTH} ${PILE_HEIGHT}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    floor() +
    cables.slice(0, 7).join('') +
    sorted.slice(0, split).join('') +
    tapes.join('') +
    cables.slice(7).join('') +
    sorted.slice(split).join('') +
    `</svg>`
  )
}

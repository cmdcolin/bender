// A heap of bent hardware on the floor, seen from above, drawn as flat SVG
// shapes. One seed always draws the same heap.
const PILE_WIDTH = 1200
const PILE_HEIGHT = 540

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

type GripKind = 'lead' | 'jack'

interface Grip {
  x: number
  y: number
  out: number
  kind: GripKind
}

interface Thing {
  hull: Hull
  body: string
  weight: number
  boost?: number
  turn?: number
  grips?: Grip[]
  shade?: string
}

const grip = (x: number, y: number, out: number, kind: GripKind): Grip => ({
  x,
  y,
  out,
  kind,
})
const RIGHT = 0
const DOWN = Math.PI / 2
const LEFT = Math.PI
const UP = -Math.PI / 2

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

const GLOWS = ['lit0', 'lit1', 'lit2', 'lit3'] as const

const glow = (r: Rng) => `class="${pick(r, GLOWS)}"`

const toggle = (r: Rng, x: number, y: number) => {
  const hex = Array.from(
    { length: 6 },
    (_, i) =>
      `${n(x + Math.cos((i * TAU) / 6) * 6)},${n(y + Math.sin((i * TAU) / 6) * 6)}`,
  ).join(' ')
  const tip = y + (r() < 0.5 ? -11 : 11)
  return (
    `<polygon points="${hex}" fill="${C.steel}" stroke="${C.black}" stroke-width="1"/>` +
    circle(x, y, 3, C.grey) +
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${tip}" stroke="${C.steel}" stroke-width="3.5" stroke-linecap="round"/>` +
    circle(x, tip, 2.6, C.white, `stroke="${C.black}" stroke-width="0.8"`)
  )
}

const contact = (x: number, y: number) =>
  circle(x, y, 5, C.gold, `stroke="${C.black}" stroke-width="1"`) +
  `<path d="M${x - 3},${y}h6M${x},${y - 3}v6" stroke="${mix(C.gold, C.ink, 0.6)}" stroke-width="1.2"/>`

const glue = (x: number, y: number, rx: number, ry: number) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${C.white}" opacity="0.4"/>`

const bodge = (
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  color: string,
) =>
  `<path d="M${x1},${y1}Q${cx},${cy} ${x2},${y2}" fill="none" stroke="${mix(color, C.ink, 0.35)}" stroke-width="2.8" stroke-linecap="round"/>` +
  `<path d="M${x1},${y1}Q${cx},${cy} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`

const socket = (x: number, y: number, w: number) =>
  rect(x, y - 6, w, 12, C.steel) + rect(x, y - 2, w, 4, C.grey)

const keyboard = (r: Rng): Thing => {
  const body = pick(r, BODIES)
  let s = socket(130, -24, 6) + rect(-130, -58, 260, 116, body, 10)
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
  if (r() < 0.8) {
    for (const x of [-108, -90, -72]) s += toggle(r, x, 32)
    s += contact(110, 14) + contact(110, 38)
  }
  return {
    hull: hull(-130, -58, 260, 116, 10),
    body: s,
    weight: 3,
    grips: [grip(136, -24, RIGHT, 'jack')],
  }
}

const drums = (r: Rng): Thing => {
  const body = pick(r, BODIES)
  let s = socket(100, -50, 6) + rect(-100, -75, 200, 150, body, 12)
  s += rect(-82, -61, 70, 22, C.screen, 3)
  s += knobAt(30, -50, 9, C.steel, between(r, 0, TAU))
  s += knobAt(62, -50, 9, C.steel, between(r, 0, TAU))
  s += toggle(r, 2, -50)
  const pads = [C.pink, C.mustard, C.teal, C.white]
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const x = -82 + col * 42
      const y = -24 + row * 34
      s += rect(
        x,
        y,
        34,
        28,
        pads[(row + col) % 4]!,
        4,
        `stroke="${C.black}" stroke-width="1"`,
      )
      s += rect(
        x,
        y,
        34,
        28,
        C.white,
        4,
        `class="pad${(row * 3 + col) % 4}" opacity="0"`,
      )
    }
  return {
    hull: hull(-100, -75, 200, 150, 12),
    body: s,
    weight: 3,
    grips: [grip(106, -50, RIGHT, 'jack')],
  }
}

const openToy = (r: Rng): Thing => {
  const body = pick(r, BODIES)
  const shell = mix(body, C.ink, 0.5)
  let s = socket(-131, -4, 6) + rect(-125, -70, 250, 140, body, 14)
  s += rect(-114, -59, 228, 118, shell, 9)
  for (const [x, y] of [
    [-104, -49],
    [104, -49],
    [-104, 49],
    [104, 49],
  ] as const)
    s += circle(x, y, 6, body) + circle(x, y, 2.5, C.ink)
  s += circle(-72, -14, 32, C.rim) + circle(-72, -14, 25, C.cone)
  s += circle(-72, -14, 8, C.well)
  s += rect(-106, 24, 66, 28, C.plastic, 3)
  for (const y of [28, 39])
    s +=
      rect(-102, y, 48, 9, pick(r, [C.red, C.blue, C.black]), 2) +
      rect(-102, y, 14, 9, C.steel, 2) +
      rect(-54, y + 2, 4, 5, C.steel)
  s += rect(-24, -50, 128, 96, C.green, 4)
  for (let i = 0; i < 6; i++) {
    const x = between(r, -16, 96)
    const y = between(r, -42, 38)
    s += `<polyline points="${n(x)},${n(y)} ${n(x + between(r, -30, 30))},${n(y)} ${n(x + between(r, -30, 30))},${n(y + between(r, -20, 20))}" fill="none" stroke="${C.trace}" stroke-width="1.6" stroke-linejoin="round"/>`
  }
  for (let k = 0; k < 6; k++) s += rect(-14 + k * 16, 28, 11, 9, C.black, 4)
  s += circle(40, -6, 15, C.ink, `stroke="${C.cone}" stroke-width="2"`)
  const wires = [C.red, C.mustard, C.teal, C.white, C.pink]
  const toggles = [6, 32, 58]
  toggles.forEach((x, i) => {
    s += bodge(
      22 + i * 18,
      -22,
      x + between(r, -18, 18),
      -40,
      x,
      -56,
      wires[i]!,
    )
    s += glue(22 + i * 18, -22, 5, 4) + glue(x, -56, 8, 5)
  })
  for (const x of toggles) s += toggle(r, x, -64.5)
  s += bodge(70, 20, 74, 48, 60, 64.5, wires[3]!)
  s += bodge(84, 22, 96, 50, 88, 64.5, wires[4]!)
  s += glue(77, 21, 9, 5)
  s += contact(60, 64.5) + contact(88, 64.5)
  for (const [i, y] of [14, 22, 30].entries())
    s += bodge(
      96,
      -2 + i * 9,
      128,
      y + between(r, 4, 16),
      152,
      y,
      [C.red, C.mustard, C.black][i]!,
    )
  s += glue(96, 7, 6, 12)
  for (const y of [14, 22, 30]) s += rect(148, y - 2, 10, 4, C.copper, 1)
  s += circle(172, 22, 17, C.steel, `stroke="${C.grey}" stroke-width="2"`)
  s += circle(172, 22, 7, C.grey) + circle(172, 22, 3.5, C.steel)
  const slot = between(r, 0, TAU)
  s += `<line x1="${n(172 - Math.cos(slot) * 3)}" y1="${n(22 - Math.sin(slot) * 3)}" x2="${n(172 + Math.cos(slot) * 3)}" y2="${n(22 + Math.sin(slot) * 3)}" stroke="${C.black}" stroke-width="1"/>`
  return {
    hull: hull(-125, -70, 315, 140, 14),
    shade: rect(-125, -70, 250, 140, C.ink, 14) + circle(172, 22, 17, C.ink),
    body: s,
    weight: 3,
    grips: [grip(-131, -4, LEFT, 'jack')],
  }
}

const footswitch = (x: number, y: number, r: number) =>
  circle(x, y, r, C.steel, `stroke="${C.black}" stroke-width="1.5"`) +
  circle(x, y, r * 0.6, C.grey)

const lamp = (r: Rng, x: number, y: number, color: string) =>
  circle(
    x,
    y,
    3.5,
    mix(color, C.ink, 0.6),
    `stroke="${C.black}" stroke-width="1"`,
  ) + circle(x, y, 2.8, color, glow(r))

const pedalColors = [C.blue, C.teal, C.mustard, C.orange, C.pink, C.grey]

const stomp = (r: Rng): Thing => {
  const body = pick(r, [C.blue, C.teal, C.grey, C.mustard])
  let s = rect(-45, -70, 90, 140, body, 9)
  s += socket(-50, -24, 5) + socket(45, -24, 5)
  s += knobAt(-22, -46, 9, C.steel, between(r, 0, TAU))
  s += knobAt(22, -46, 9, C.steel, between(r, 0, TAU))
  s += lamp(r, 0, -26, C.red)
  s += rect(-32, -14, 64, 30, C.cream, 3)
  s += rect(-24, -7, 48, 4, C.black, 1) + rect(-24, 3, 30, 4, C.black, 1)
  s += circle(0, 44, 15, C.steel, `stroke="${C.black}" stroke-width="1.5"`)
  s += circle(0, 44, 9, C.grey)
  return {
    hull: hull(-45, -70, 90, 140, 9),
    body: s,
    weight: 2,
    grips: [grip(-50, -24, LEFT, 'jack'), grip(50, -24, RIGHT, 'jack')],
  }
}

const compact = (r: Rng): Thing => {
  let s = rect(-30, -58, 60, 116, pick(r, pedalColors), 6)
  s += knobAt(-13, -42, 6.5, C.steel, between(r, 0, TAU))
  s += knobAt(13, -42, 6.5, C.steel, between(r, 0, TAU))
  s += lamp(r, 0, -26, C.red)
  s += rect(-24, -18, 48, 20, C.cream, 3) + rect(-18, -11, 36, 4, C.black, 1)
  s += rect(-26, 10, 52, 40, C.well, 5)
  for (let i = 0; i < 4; i++) s += rect(-22, 16 + i * 8, 44, 2, C.cone, 1)
  s += socket(-34, -29, 4) + socket(30, -29, 4)
  return {
    hull: hull(-30, -58, 60, 116, 6),
    body: s,
    weight: 2,
    grips: [grip(-34, -29, LEFT, 'jack'), grip(34, -29, RIGHT, 'jack')],
  }
}

const wideBox = (r: Rng): Thing => {
  let s =
    socket(-75, -14, 5) +
    socket(70, -14, 5) +
    rect(-70, -55, 140, 110, pick(r, [C.cream, C.red, C.grey, C.mustard]), 8)
  for (const x of [-40, 0, 40])
    s += knobAt(x, -28, 11, C.black, between(r, 0, TAU))
  s += rect(-52, -4, 104, 16, C.white, 2) + rect(-44, 2, 60, 4, C.black, 1)
  s += footswitch(0, 34, 14) + lamp(r, -52, 34, C.red)
  for (const [x, y] of [
    [-63, -48],
    [63, -48],
    [-63, 48],
    [63, 48],
  ] as const)
    s += circle(x, y, 2.5, C.grey)
  return {
    hull: hull(-70, -55, 140, 110, 8),
    body: s,
    weight: 3,
    grips: [grip(-75, -14, LEFT, 'jack'), grip(75, -14, RIGHT, 'jack')],
  }
}

const equalizer = (r: Rng): Thing => {
  let s = rect(-62, -52, 124, 104, pick(r, [C.grey, C.mustard, C.teal]), 6)
  for (let i = 0; i < 7; i++) {
    const x = -45 + i * 15
    s += rect(x - 2, -38, 4, 52, C.black, 2)
    s += rect(x - 6, between(r, -36, 8), 12, 6, C.cream, 1)
  }
  s += footswitch(0, 36, 9) + lamp(r, 46, -46, C.red)
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
  s +=
    knobAt(-14, 56, 6.5, C.steel, between(r, 0, TAU)) + lamp(r, 14, 56, C.green)
  return { hull: hull(-35, -75, 70, 150, 8), body: s, weight: 3 }
}

const tuner = (r: Rng): Thing => {
  let s = rect(-28, -45, 56, 90, pick(r, [C.teal, C.mustard, C.pink]), 6)
  s += rect(-21, -36, 42, 28, C.screen, 3)
  for (let i = -3; i <= 3; i++) s += rect(i * 5 - 0.5, -14, 1, 4, C.black)
  const lean = between(r, -0.5, 0.5)
  s += `<g transform="rotate(${n((lean * 180) / Math.PI)} 0 -12)"><line class="needle" x1="0" y1="-12" x2="0" y2="-28" stroke="${C.black}" stroke-width="1.6" stroke-linecap="round"/></g>`
  s += lamp(r, -8, 0, C.red) + lamp(r, 8, 0, C.green)
  s += footswitch(0, 24, 12)
  return { hull: hull(-28, -45, 56, 90, 6), body: s, weight: 2 }
}

const hub = (x: number, y: number) =>
  `<g class="hub">` +
  circle(x, y, 9, C.cream) +
  circle(x, y, 4.5, C.black) +
  [0, 1, 2]
    .map(i => {
      const a = (i * TAU) / 3
      return `<line x1="${n(x + Math.cos(a) * 2)}" y1="${n(y + Math.sin(a) * 2)}" x2="${n(x + Math.cos(a) * 4.5)}" y2="${n(y + Math.sin(a) * 4.5)}" stroke="${C.cream}" stroke-width="1.6"/>`
    })
    .join('') +
  `</g>`

const cassette = (r: Rng): Thing => {
  const body = pick(r, [C.cream, C.grey, C.mustard, C.teal])
  let s = rect(-65, -42, 130, 84, body, 6)
  s += rect(-55, -34, 110, 44, C.white, 3)
  s += rect(-48, -26, 96, 3, C.grey) + rect(-48, -19, 70, 3, C.grey)
  s += rect(-48, -6, 96, 22, C.black, 11)
  s += hub(-30, 5) + hub(30, 5)
  s += `<polygon points="-40,42 -32,24 32,24 40,42" fill="${C.plastic}"/>`
  return { hull: hull(-65, -42, 130, 84, 6), body: s, weight: 2 }
}

const battery = (r: Rng): Thing => {
  let s = rect(-20, -34, 40, 68, pick(r, [C.black, C.plastic, C.blue]), 3)
  s += rect(-20, -8, 40, 18, C.copper)
  s += rect(-20, -34, 40, 14, C.steel, 3)
  s += circle(-8, -27, 5, C.steel, `stroke="${C.grey}" stroke-width="1.5"`)
  s += circle(8, -27, 5, C.steel, `stroke="${C.grey}" stroke-width="1.5"`)
  return {
    hull: hull(-20, -34, 40, 68, 3),
    body: s,
    weight: 1,
    boost: 1.1,
    grips: [grip(-8, -32, UP, 'lead'), grip(8, -32, UP, 'lead')],
  }
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
  return {
    hull: hull(-75, -50, 150, 100, 4),
    body: s,
    weight: 2,
    grips: [grip(-58, 42, DOWN, 'lead'), grip(-50, 42, DOWN, 'lead')],
  }
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
    `<g class="cone">` +
    circle(0, 0, 26, C.cone) +
    circle(0, 0, 9, C.well) +
    `</g>` +
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
  return {
    hull: hull(-20, -7, 40, 14, 7),
    body: s,
    weight: 0,
    boost: 1.25,
    grips: [grip(-42, 0, LEFT, 'lead'), grip(42, 0, RIGHT, 'lead')],
  }
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
  return {
    hull: hull(-10, -10, 20, 20, 10),
    body: s,
    weight: 0,
    boost: 1.3,
    grips: [grip(-4, 24, DOWN, 'lead')],
  }
}

const led = (r: Rng): Thing => {
  const color = pick(r, [C.red, C.mustard, C.green, C.teal])
  let s = lead(-3, 10, -3, 28) + lead(3, 10, 3, 22)
  s += circle(0, 0, 11, mix(color, C.ink, 0.35))
  s += `<g ${glow(r)}>`
  s += circle(0, 0, 8.5, color)
  s += circle(-3, -3, 2.5, mix(color, C.white, 0.6))
  s += `</g>`
  return {
    hull: hull(-11, -11, 22, 22, 11),
    body: s,
    weight: 0,
    boost: 1.3,
    grips: [grip(-3, 28, DOWN, 'lead')],
  }
}

const diode = (): Thing => {
  let s = lead(-30, 0, -12, 0) + lead(12, 0, 30, 0)
  s += rect(-12, -4.5, 24, 9, C.orange, 4.5)
  s += rect(5, -4.5, 4, 9, C.black)
  return {
    hull: hull(-12, -4.5, 24, 9, 4.5),
    body: s,
    weight: 0,
    boost: 1.4,
    grips: [grip(-30, 0, LEFT, 'lead'), grip(30, 0, RIGHT, 'lead')],
  }
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

const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`

const cylinder = (
  cx: number,
  top: number,
  bottom: number,
  rx: number,
  ry: number,
  fill: string,
) =>
  `<path d="M${cx - rx},${top} L${cx - rx},${bottom} A${rx},${ry} 0 0 0 ${cx + rx},${bottom} L${cx + rx},${top} Z" fill="${mix(fill, C.ink, 0.3)}"/>` +
  ellipse(cx, top, rx, ry, fill)

const pot = (r: Rng): Thing => {
  let s = ''
  for (const x of [-9, 0, 9])
    s += rect(x - 1.5, 22, 3, 10, C.copper) + circle(x, 28, 0.9, C.ink)
  s += cylinder(0, 0, 22, 16, 6, C.steel)
  s += rect(-16, 11, 32, 2, mix(C.steel, C.ink, 0.45))
  s += cylinder(0, -12, 0, 8, 3, C.gold)
  for (let i = -5; i <= 5; i += 2.5)
    s += `<line x1="${i}" y1="-10" x2="${i}" y2="-1" stroke="${mix(C.gold, C.ink, 0.5)}" stroke-width="0.7"/>`
  s += cylinder(0, -9, -4, 11, 4, C.steel)
  s += cylinder(0, -34, -11, 3.5, 1.4, C.grey)
  s += ellipse(0, -34, 3.5, 1.4, C.steel)
  s += `<line x1="${n(-2.6)}" y1="-34" x2="${n(2.6)}" y2="${n(-34 + between(r, -0.4, 0.4))}" stroke="${C.black}" stroke-width="0.9"/>`
  return {
    hull: hull(-15, -2, 30, 28, 12),
    body: s,
    weight: 0,
    boost: 1.3,
    turn: 30,
    grips: [grip(-9, 32, DOWN, 'lead'), grip(9, 32, DOWN, 'lead')],
  }
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

const jack = (
  x: number,
  y: number,
  angle: number,
  color: string,
  plugged: boolean,
) =>
  `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})">` +
  rect(-24, -7, 24, 14, C.plastic, 4) +
  rect(-24, -7, 9, 14, color, 4) +
  (plugged
    ? rect(0, -6, 4, 12, C.steel, 1)
    : rect(0, -6, 16, 12, C.steel, 2) +
      rect(16, -3.5, 3, 7, C.black) +
      rect(19, -3.5, 8, 7, C.steel, 1) +
      rect(27, -3.5, 2, 7, C.black) +
      rect(29, -3, 8, 6, C.steel, 3)) +
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

type Cubic = readonly [Pt, Pt, Pt, Pt]

interface Anchor {
  x: number
  y: number
  out: number
  layer: number
}

const inside = (v: number, size: number) => {
  const bounced = v < 30 ? 60 - v : v > size - 30 ? 2 * (size - 30) - v : v
  return Math.min(size - 30, Math.max(30, bounced))
}

const away = (a: Anchor, d: number): Pt => [
  a.x + Math.cos(a.out) * d,
  a.y + Math.sin(a.out) * d,
]

const waypoints = (r: Rng, long: boolean, from?: Anchor): Pt[] => {
  const [x0, y0] = from
    ? away(from, between(r, 40, 70))
    : [between(r, 60, PILE_WIDTH - 60), between(r, 60, PILE_HEIGHT - 60)]
  const heading = from
    ? from.out + between(r, -0.7, 0.7)
    : Math.atan2(PILE_HEIGHT / 2 - y0, PILE_WIDTH / 2 - x0) +
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
  return from ? [[from.x, from.y], ...points] : points
}

const cubics = (p: Pt[]): Cubic[] =>
  p.slice(0, -1).map((b, i) => {
    const a = p[i - 1] ?? b
    const c = p[i + 1]!
    const e = p[i + 2] ?? c
    return [
      b,
      [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6],
      [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6],
      c,
    ]
  })

const midpoint = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

const halves = ([p0, p1, p2, p3]: Cubic): Cubic[] => {
  const p01 = midpoint(p0, p1)
  const p12 = midpoint(p1, p2)
  const p23 = midpoint(p2, p3)
  const a = midpoint(p01, p12)
  const b = midpoint(p12, p23)
  const m = midpoint(a, b)
  return [
    [p0, p01, a, m],
    [m, b, p23, p3],
  ]
}

const pt = ([x, y]: Pt) => `${n(x)} ${n(y)}`

const trace = (run: Cubic[]) =>
  `M${pt(run[0]![0])}` +
  run.map(([, c1, c2, c]) => `C${pt(c1)} ${pt(c2)} ${pt(c)}`).join('')

const weave = (
  r: Rng,
  count: number,
  top: number,
  from?: Anchor,
  to?: Anchor,
) => {
  const level = (high: boolean) =>
    Math.round((high ? between(r, 0.6, 1) : between(r, 0, 0.35)) * top)
  let high = r() < 0.5
  let layer = level(high)
  const layers = Array.from({ length: count }, () => {
    if (r() < 0.4) {
      high = !high
      layer = level(high)
    }
    return layer
  })
  if (from) layers[0] = Math.max(layers[0]!, from.layer + 1)
  if (to) layers[count - 1] = Math.max(layers[count - 1]!, to.layer + 1)
  return layers
}

const runsOf = (segments: Cubic[], layers: number[]) => {
  const runs: { layer: number; run: Cubic[] }[] = []
  segments.forEach((segment, i) => {
    const last = runs.at(-1)
    if (last && last.layer === layers[i]) last.run.push(segment)
    else runs.push({ layer: layers[i]!, run: [segment] })
  })
  return runs
}

const stroke = (d: string, color: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n(width)}"/>`

const degrees = (radians: number) => (radians * 180) / Math.PI

type Pool = Record<GripKind, Anchor[]>

const wire = (
  r: Rng,
  kind: CableKind,
  long: boolean,
  top: number,
  pool: Pool,
  bucket: string[][],
) => {
  const want =
    kind === 'alligator' ? 'lead' : kind === 'patch' ? 'jack' : undefined
  const reach = kind === 'alligator' ? 22 : 4
  const take = (near?: Pt) => {
    const free = want ? pool[want] : []
    const found = near
      ? free
          .map(a => ({ a, d: Math.hypot(a.x - near[0], a.y - near[1]) }))
          .filter(({ d }) => d < 170)
          .toSorted((p, q) => p.d - q.d)[0]?.a
      : r() < 0.75
        ? free[Math.floor(r() * free.length)]
        : undefined
    if (found) free.splice(free.indexOf(found), 1)
    const end = found && away(found, reach)
    return found && end && { ...found, x: end[0], y: end[1] }
  }
  const from = take()
  const walked = waypoints(r, long || kind === 'tape', from)
  const to = take(walked.at(-1))
  const end: Pt[] = to ? [away(to, between(r, 40, 70)), [to.x, to.y]] : []
  const points = to ? [...walked.slice(0, -1), ...end] : walked
  const segments = cubics(points).flatMap(halves)
  const layers = weave(r, segments.length, top, from, to)
  const color =
    kind === 'tape' ? C.tape : pick(r, kind === 'patch' ? PATCH : WIRES)
  const width =
    kind === 'tape'
      ? 2.5
      : kind === 'patch'
        ? between(r, 4.5, 5.5)
        : between(r, 2.8, 3.6)
  for (const { layer, run } of runsOf(segments, layers)) {
    const d = trace(run)
    const lift = layer / top
    bucket[layer]!.push(
      `<g transform="translate(${n(3 + lift * 4)} ${n(5 + lift * 5)})" opacity="0.4">${stroke(d, C.ink, width + 1.6)}</g>` +
        stroke(d, mix(color, C.ink, 0.3), width + 1.2) +
        stroke(d, color, width) +
        stroke(d, mix(color, C.white, 0.28), width * 0.22),
    )
  }
  const first = segments[0]!
  const last = segments.at(-1)!
  const ends = [
    {
      at: first[0],
      anchor: from,
      angle: Math.atan2(first[0][1] - first[1][1], first[0][0] - first[1][0]),
      layer: layers[0]!,
    },
    {
      at: last[3],
      anchor: to,
      angle: Math.atan2(last[3][1] - last[2][1], last[3][0] - last[2][0]),
      layer: layers.at(-1)!,
    },
  ]
  for (const { at, anchor, angle, layer } of ends) {
    const [x, y] = at
    const a = degrees(anchor ? anchor.out + Math.PI : angle)
    const tip =
      kind === 'alligator'
        ? alligator(x, y, a, color)
        : kind === 'patch'
          ? jack(x, y, a, color, anchor !== undefined)
          : kind === 'frayed'
            ? fray(r, x, y, a, width)
            : ''
    bucket[layer]!.push(tip)
  }
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

const offcut = (r: Rng, x: number, y: number) => {
  const a = between(r, 0, TAU)
  const half = between(r, 4, 13)
  const b = a + between(r, -1, 1)
  const points = `${n(x)},${n(y)} ${n(x + Math.cos(a) * half)},${n(y + Math.sin(a) * half)} ${n(x + Math.cos(a) * half + Math.cos(b) * half)},${n(y + Math.sin(a) * half + Math.sin(b) * half)}`
  const line = (color: string, extra = '') =>
    `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`
  return (
    `<g transform="translate(1.5 2)" opacity="0.4">${line(C.ink)}</g>` +
    line(C.steel)
  )
}

const screw = (r: Rng, x: number, y: number) => {
  const a = between(r, 0, TAU)
  return (
    circle(n(x + 1.5), n(y + 2), 4.5, C.ink, 'opacity="0.4"') +
    circle(n(x), n(y), 4.5, C.steel, `stroke="${C.grey}" stroke-width="1"`) +
    `<line x1="${n(x - Math.cos(a) * 3)}" y1="${n(y - Math.sin(a) * 3)}" x2="${n(x + Math.cos(a) * 3)}" y2="${n(y + Math.sin(a) * 3)}" stroke="${C.black}" stroke-width="1.2"/>`
  )
}

const blob = (r: Rng, x: number, y: number) =>
  circle(n(x), n(y), n(between(r, 1.6, 3)), mix(C.steel, C.white, 0.4))

interface Placed {
  thing: Thing
  spot: Spot
  turn: number
  scale: number
  weight: number
}

const at = (p: Placed, inner: string) =>
  `<g transform="translate(${n(p.spot.x)} ${n(p.spot.y)}) rotate(${n(p.turn)}) scale(${n(p.scale)})">${inner}</g>`

const drawThing = (p: Placed, level: number) => {
  const { x, y, w, h, rx } = p.thing.hull
  const shade = p.thing.shade ?? rect(x, y, w, h, C.ink, rx)
  return (
    `<g transform="translate(${4 + level * 2} ${6 + level * 3})" opacity="${level > 1 ? 0.3 : 0.4}">${at(p, shade)}</g>` +
    at(p, p.thing.body)
  )
}

const reachOf = (p: Placed) => ((p.thing.hull.w + p.thing.hull.h) / 4) * p.scale

export const pile = (seed = 3): string => {
  const r = seeded(seed)
  const taken: Spot[] = []
  const heap: Placed[] = []

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
        thing,
        spot,
        turn: between(r, -(thing.turn ?? 180), thing.turn ?? 180),
        scale,
        weight: thing.weight + r() * 0.9,
      })
    }
  }

  toss(keyboard, 1, 14)
  toss(openToy, 1, 14)
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

  const stack = heap.toSorted((a, b) => b.weight - a.weight)
  const top = stack.length
  const drawn = stack.map((p, i) =>
    drawThing(
      p,
      Math.min(
        3,
        stack
          .slice(0, i)
          .filter(
            q =>
              Math.hypot(q.spot.x - p.spot.x, q.spot.y - p.spot.y) <
              0.75 * (reachOf(p) + reachOf(q)),
          ).length,
      ),
    ),
  )

  const pool: Pool = { lead: [], jack: [] }
  stack.forEach((p, layer) => {
    const a = (p.turn * Math.PI) / 180
    for (const g of p.thing.grips ?? []) {
      const gx = g.x * p.scale
      const gy = g.y * p.scale
      pool[g.kind].push({
        x: p.spot.x + gx * Math.cos(a) - gy * Math.sin(a),
        y: p.spot.y + gx * Math.sin(a) + gy * Math.cos(a),
        out: g.out + a,
        layer,
      })
    }
  })

  const bucket = Array.from({ length: top + 1 }, (): string[] => [])
  const scatter = (
    count: number,
    draw: (r: Rng, x: number, y: number) => string,
  ) => {
    for (let i = 0; i < count; i++) {
      const x = inside(PILE_WIDTH / 2 + gauss(r) * 330, PILE_WIDTH)
      const y = inside(PILE_HEIGHT / 2 + gauss(r) * 140, PILE_HEIGHT)
      const layer = r() < 0.6 ? 0 : Math.floor(between(r, 0.2, 1) * top)
      bucket[layer]!.push(draw(r, x, y))
    }
  }
  scatter(34, offcut)
  scatter(5, screw)
  scatter(10, blob)

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
    ['tape', true],
    ['tape', true],
  ]
  for (const [kind, long] of kinds) wire(r, kind, long, top, pool, bucket)

  return (
    `<svg viewBox="0 0 ${PILE_WIDTH} ${PILE_HEIGHT}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    floor() +
    bucket.map((layer, i) => layer.join('') + (drawn[i] ?? '')).join('') +
    `</svg>`
  )
}

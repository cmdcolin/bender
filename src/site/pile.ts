// A heap of bent hardware on the floor, seen from above, drawn as flat SVG
// shapes. The seed fixes the heap, so every build draws the same one.
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
}

const WIRES = [C.red, C.mustard, C.teal, C.pink, C.blue, C.white, C.grey]
const BODIES = [C.red, C.teal, C.mustard, C.pink, C.blue]

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
const between = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo)
const pick = <T>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!
const gauss = (r: Rng) =>
  Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())

interface Thing {
  shadow: string
  body: string
  weight: number
}

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
    s += knobAt(40 + k * 26, -36, 7, C.steel, between(r, 0, 6.28))
  return { shadow: rect(-130, -58, 260, 116, '#000', 10), body: s, weight: 3 }
}

const drums = (r: Rng): Thing => {
  const body = pick(r, BODIES)
  let s = rect(-100, -75, 200, 150, body, 12)
  s += rect(-82, -61, 70, 22, '#7fe3b0', 3)
  s += knobAt(30, -50, 9, C.steel, between(r, 0, 6.28))
  s += knobAt(62, -50, 9, C.steel, between(r, 0, 6.28))
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
  return { shadow: rect(-100, -75, 200, 150, '#000', 12), body: s, weight: 3 }
}

const pedal = (r: Rng): Thing => {
  const body = pick(r, [C.blue, C.red, C.teal, C.grey, C.mustard])
  let s = rect(-45, -70, 90, 140, body, 9)
  s += rect(-50, -30, 5, 12, C.steel) + rect(45, -30, 5, 12, C.steel)
  s += knobAt(-22, -46, 9, C.steel, between(r, 0, 6.28))
  s += knobAt(22, -46, 9, C.steel, between(r, 0, 6.28))
  s += circle(0, -26, 4, C.red)
  s += rect(-32, -14, 64, 30, C.cream, 3)
  s += rect(-24, -7, 48, 4, C.black, 1) + rect(-24, 3, 30, 4, C.black, 1)
  s += circle(0, 44, 15, C.steel, `stroke="${C.black}" stroke-width="1.5"`)
  s += circle(0, 44, 9, C.grey)
  return { shadow: rect(-45, -70, 90, 140, '#000', 9), body: s, weight: 2 }
}

const cassette = (r: Rng): Thing => {
  const body = pick(r, [C.cream, C.grey, C.mustard, C.teal])
  let s = rect(-65, -42, 130, 84, body, 6)
  s += rect(-55, -34, 110, 44, C.white, 3)
  s += rect(-48, -26, 96, 3, C.grey) + rect(-48, -19, 70, 3, C.grey)
  s += rect(-34, -6, 68, 22, C.black, 11)
  s += circle(-18, 5, 8, C.cream) + circle(18, 5, 8, C.cream)
  s += circle(-18, 5, 3, C.black) + circle(18, 5, 3, C.black)
  s += `<polygon points="-40,42 -32,24 32,24 40,42" fill="#2b2b31"/>`
  return { shadow: rect(-65, -42, 130, 84, '#000', 6), body: s, weight: 2 }
}

const battery = (r: Rng): Thing => {
  let s = rect(-20, -34, 40, 68, pick(r, [C.black, '#2a2a31', C.blue]), 3)
  s += rect(-20, -8, 40, 18, C.copper)
  s += rect(-20, -34, 40, 14, C.steel, 3)
  s += circle(-8, -27, 5, C.steel, `stroke="${C.grey}" stroke-width="1.5"`)
  s += circle(8, -27, 5, C.steel, `stroke="${C.grey}" stroke-width="1.5"`)
  return { shadow: rect(-20, -34, 40, 68, '#000', 3), body: s, weight: 1 }
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
  return { shadow: rect(-75, -50, 150, 100, '#000', 4), body: s, weight: 2 }
}

const chip = (): Thing => {
  let s = rect(-25, -11, 50, 22, C.black, 2) + circle(-19, 0, 3, C.grey)
  for (let i = 0; i < 6; i++)
    s +=
      rect(-22 + i * 8, -15, 3, 4, C.steel) +
      rect(-22 + i * 8, 11, 3, 4, C.steel)
  return { shadow: rect(-25, -13, 50, 26, '#000', 2), body: s, weight: 0 }
}

const knob = (r: Rng): Thing => ({
  shadow: circle(0, 0, 13, '#000'),
  body: knobAt(
    0,
    0,
    13,
    pick(r, [C.cream, C.red, C.steel, C.mustard]),
    between(r, 0, 6.28),
  ),
  weight: 0,
})

const speaker = (): Thing => ({
  shadow: circle(0, 0, 48, '#000'),
  body:
    circle(0, 0, 48, '#25252c') +
    circle(0, 0, 40, '#18181d', `stroke="${C.steel}" stroke-width="3"`) +
    circle(0, 0, 26, '#33333c') +
    circle(0, 0, 9, '#18181d') +
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
  return { shadow: rect(-50, -8, 124, 16, '#000', 6), body: s, weight: 0 }
}

const spool = (): Thing => {
  let s =
    circle(0, 0, 20, C.black) +
    circle(0, 0, 14, C.tape) +
    circle(0, 0, 5, C.cream)
  s += circle(0, 0, 2, C.black)
  s += `<line x1="0" y1="-14" x2="0" y2="-20" stroke="${C.cream}" stroke-width="2"/>`
  return { shadow: circle(0, 0, 20, '#000'), body: s, weight: 0 }
}

interface Spot {
  x: number
  y: number
}

const place = (r: Rng, taken: Spot[], tries: number): Spot => {
  let best: Spot = { x: 0, y: 0 }
  let far = -1
  for (let i = 0; i < tries; i++) {
    const x = Math.min(
      PILE_WIDTH - 40,
      Math.max(40, PILE_WIDTH / 2 + gauss(r) * 250),
    )
    const y = Math.min(
      PILE_HEIGHT - 40,
      Math.max(40, PILE_HEIGHT / 2 + gauss(r) * 105),
    )
    const gap = Math.min(...taken.map(t => Math.hypot(t.x - x, t.y - y)), 1e9)
    if (gap > far) {
      far = gap
      best = { x, y }
    }
  }
  taken.push(best)
  return best
}

const at = (spot: Spot, turn: number, scale: number, inner: string) =>
  `<g transform="translate(${n(spot.x)} ${n(spot.y)}) rotate(${n(turn)}) scale(${n(scale)})">${inner}</g>`

const drawThing = (thing: Thing, spot: Spot, turn: number, scale: number) =>
  at(
    spot,
    turn,
    scale,
    `<g transform="translate(5 7)" fill="#000" opacity="0.4">${thing.shadow}</g>${thing.body}`,
  )

const clip = (x: number, y: number, angle: number, sleeve: string) =>
  `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})">` +
  `<polygon points="0,-7 34,-12 34,-1 0,-1" fill="${C.steel}"/>` +
  `<polygon points="0,7 34,12 34,1 0,1" fill="${C.grey}"/>` +
  `<polygon points="26,-11 34,-12 34,-6" fill="${C.black}"/><polygon points="26,11 34,12 34,6" fill="${C.black}"/>` +
  rect(-18, -8, 18, 16, sleeve, 3) +
  `</g>`

const plug = (x: number, y: number, angle: number) =>
  `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})">` +
  rect(-6, -6, 22, 12, C.black, 2) +
  rect(16, -4, 20, 8, C.steel, 2) +
  rect(36, -2.5, 8, 5, C.steel, 2) +
  `</g>`

const bare = (x: number, y: number, angle: number, color: string) =>
  `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})" stroke="${C.copper}" stroke-width="1.4" stroke-linecap="round">` +
  `<line x1="0" y1="0" x2="9" y2="-3"/><line x1="0" y1="0" x2="11" y2="0"/><line x1="0" y1="0" x2="9" y2="3"/>` +
  `<line x1="-8" y1="0" x2="0" y2="0" stroke="${color}" stroke-width="4"/></g>`

const wire = (r: Rng, kind: 'cable' | 'tape') => {
  const x0 = between(r, 60, PILE_WIDTH - 60)
  const y0 = between(r, 60, PILE_HEIGHT - 60)
  const heading = between(r, 0, 6.28)
  const length = between(r, 180, kind === 'tape' ? 520 : 400)
  const x3 = x0 + Math.cos(heading) * length
  const y3 = y0 + Math.sin(heading) * length * 0.6
  const bend = () => between(r, -150, 150)
  const x1 = x0 + (x3 - x0) / 3 + bend()
  const y1 = y0 + (y3 - y0) / 3 + bend()
  const x2 = x0 + ((x3 - x0) * 2) / 3 + bend()
  const y2 = y0 + ((y3 - y0) * 2) / 3 + bend()
  const d = `M${n(x0)} ${n(y0)}C${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x3)} ${n(y3)}`
  const color = kind === 'tape' ? C.tape : pick(r, WIRES)
  const width = kind === 'tape' ? 2.5 : between(r, 3, 5)
  const tail = (Math.atan2(y3 - y2, x3 - x2) * 180) / Math.PI
  const head = (Math.atan2(y0 - y1, x0 - x1) * 180) / Math.PI
  let ends = ''
  if (kind === 'cable') {
    const sleeve = pick(r, [C.red, C.black])
    const ending = (x: number, y: number, angle: number) => {
      const roll = r()
      if (roll < 0.45) return clip(x, y, angle, sleeve)
      if (roll < 0.75) return plug(x, y, angle)
      return bare(x, y, angle, color)
    }
    ends = ending(x3, y3, tail) + ending(x0, y0, head)
  }
  const stroke = (c: string, w: number, extra = '') =>
    `<path d="${d}" fill="none" stroke="${c}" stroke-width="${n(w)}" stroke-linecap="round" ${extra}/>`
  return (
    `<g transform="translate(4 6)" opacity="0.4">${stroke('#000', width)}</g>` +
    stroke(color, width) +
    ends
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

  const toss = (make: (r: Rng) => Thing, count: number, tries: number) => {
    for (let i = 0; i < count; i++) {
      const thing = make(r)
      const spot = place(r, taken, tries)
      const scale = between(r, 0.85, 1.12)
      heap.push({
        weight: thing.weight + r() * 0.9,
        svg: drawThing(thing, spot, between(r, -180, 180), scale),
      })
    }
  }

  toss(keyboard, 2, 10)
  toss(drums, 1, 10)
  toss(speaker, 1, 8)
  toss(pedal, 3, 6)
  toss(cassette, 3, 5)
  toss(board, 3, 5)
  toss(battery, 4, 3)
  toss(spool, 2, 3)
  toss(chip, 7, 2)
  toss(knob, 7, 2)
  toss(screwdriver, 1, 3)

  const sorted = heap.toSorted((a, b) => b.weight - a.weight).map(h => h.svg)
  const split = Math.ceil(sorted.length * 0.55)
  const cables = Array.from({ length: 13 }, () => wire(r, 'cable'))
  const tapes = Array.from({ length: 2 }, () => wire(r, 'tape'))

  return (
    `<svg viewBox="0 0 ${PILE_WIDTH} ${PILE_HEIGHT}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A messy pile of bent hardware on the floor: toy keyboards, a drum machine, guitar pedals, cassettes, circuit boards, batteries and loose cables with alligator clips">` +
    floor() +
    cables.slice(0, 7).join('') +
    sorted.slice(0, split).join('') +
    tapes.join('') +
    cables.slice(7).join('') +
    sorted.slice(split).join('') +
    `</svg>`
  )
}

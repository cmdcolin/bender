import { SHEETS, type Board, type Placed, type Sheet } from './board.ts'

const CH = 7
const ROW = 16
const HEAD = 24
const GAP = 40
const WIDTH = 1800

const STYLE = `
  text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; fill: #1f2328 }
  .bg { fill: #ffffff }
  .box { fill: #f6f8fa; stroke: #8c959f; stroke-width: 1.2 }
  .stub { stroke: #8c959f; stroke-width: 1 }
  .title { font-size: 13px; font-weight: 700 }
  .sub { fill: #656d76 }
  .pin { fill: #656d76; font-size: 10px }
  .net { fill: #0550ae }
  .rail { fill: #9a6700 }
  .head { font-size: 18px; font-weight: 700 }
  .arrow { stroke: #8c959f; stroke-width: 1.5; fill: none }
  .tip { fill: #8c959f }
  @media (prefers-color-scheme: dark) {
    text { fill: #e6edf3 }
    .bg { fill: #0d1117 }
    .box { fill: #161b22; stroke: #6e7681 }
    .stub { stroke: #6e7681 }
    .sub, .pin { fill: #8d96a0 }
    .net { fill: #79c0ff }
    .rail { fill: #e3b341 }
    .arrow { stroke: #6e7681 }
    .tip { fill: #6e7681 }
  }
`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

interface Shown {
  num: string
  name: string
  net: string
}

interface Box {
  part: Placed
  left: Shown[]
  right: Shown[]
  w: number
  h: number
  lw: number
  rw: number
}

const isRail = (n: string) => n === 'VCC' || n === 'GND'
const isIc = (p: Placed) => !p.def.passive

function layoutBox(part: Placed): Box {
  const left: Shown[] = []
  const right: Shown[] = []
  const pins = part.def.pins.filter(p => part.conn.has(p.name) && p.dir !== 'v')
  const passive = !!part.def.passive
  pins.forEach((p, i) => {
    const shown = { num: p.num, name: p.name, net: part.conn.get(p.name)! }
    const side =
      passive || p.dir === 'p' || p.dir === 'io'
        ? i < Math.ceil(pins.length / 2)
          ? left
          : right
        : p.dir === 'i'
          ? left
          : right
    side.push(shown)
  })
  const nameW = (list: Shown[]) =>
    Math.max(0, ...list.map(s => (s.num + ' ' + s.name).length)) * CH * 0.9
  const netW = (list: Shown[]) =>
    Math.max(0, ...list.map(s => s.net.length)) * CH
  const inner = Math.max(
    nameW(left) + nameW(right) + 24,
    part.ref.length * 9 + part.value.length * CH + 30,
    120,
  )
  return {
    part,
    left,
    right,
    w: inner,
    h: HEAD + Math.max(left.length, right.length, 1) * ROW + 6,
    lw: netW(left) + 22,
    rw: netW(right) + 22,
  }
}

function drawBox(box: Box, x: number, y: number): string {
  const bx = x + box.lw
  const out: string[] = []
  out.push(
    `<rect class="box" x="${bx}" y="${y}" width="${box.w}" height="${box.h}" rx="3"/>`,
  )
  out.push(
    `<text class="title" x="${bx + 8}" y="${y + 16}">${esc(box.part.ref)}</text>`,
  )
  out.push(
    `<text class="sub" x="${bx + box.w - 8}" y="${y + 16}" text-anchor="end">${esc(box.part.value)}</text>`,
  )
  const row = (list: Shown[], side: 'l' | 'r') =>
    list.forEach((s, i) => {
      const py = y + HEAD + i * ROW + 10
      const edge = side === 'l' ? bx : bx + box.w
      const dir = side === 'l' ? -1 : 1
      out.push(
        `<line class="stub" x1="${edge}" y1="${py - 4}" x2="${edge + dir * 14}" y2="${py - 4}"/>`,
      )
      out.push(
        `<text class="pin" x="${side === 'l' ? bx + 6 : bx + box.w - 6}" y="${py}" text-anchor="${side === 'l' ? 'start' : 'end'}">${esc(s.num + ' ' + s.name)}</text>`,
      )
      out.push(
        `<text class="${isRail(s.net) ? 'rail' : 'net'}" x="${edge + dir * 18}" y="${py}" text-anchor="${side === 'l' ? 'end' : 'start'}">${esc(s.net)}</text>`,
      )
    })
  row(box.left, 'l')
  row(box.right, 'r')
  return out.join('')
}

const keyBox = (parts: Placed[]): Box => {
  const first = parts[0]!
  return {
    part: { ...first, ref: 'K0-K11', value: 'keys', conn: new Map() },
    left: parts.map((p, i) => ({
      num: String(i + 1),
      name: p.ref,
      net: p.conn.get('1')!,
    })),
    right: [{ num: '2', name: 'all', net: 'GND' }],
    w: 150,
    h: HEAD + parts.length * ROW + 6,
    lw: 70,
    rw: 40,
  }
}

export function sheetSvg(board: Board, id: Sheet): string {
  const title = SHEETS.find(s => s.id === id)!.title
  const all = [...board.parts.values()].filter(p => p.sheet === id)
  const decoupling = all.filter(p => /^C1\d\d$/.test(p.ref))
  const pads = all.filter(p => p.type === 'PAD')
  const keys = all.filter(p => p.type === 'KEY')
  const shown = all.filter(
    p => !decoupling.includes(p) && !pads.includes(p) && !keys.includes(p),
  )
  shown.sort((a, c) => Number(isIc(c)) - Number(isIc(a)))
  const boxes = shown.map(layoutBox)
  if (keys.length) boxes.push(keyBox(keys))

  let x = 20
  let y = 56
  let rowH = 0
  const placed: string[] = []
  for (const box of boxes) {
    const w = box.lw + box.w + box.rw
    if (x + w > WIDTH && x > 20) {
      x = 20
      y += rowH + GAP
      rowH = 0
    }
    placed.push(drawBox(box, x, y))
    x += w + GAP
    rowH = Math.max(rowH, box.h)
  }
  const foot = y + rowH + 34
  const notes = [
    `Power pins sit on VCC and GND. ${decoupling.length} x 100n decoupling caps (${decoupling.map(p => p.ref).join(' ')}), one per IC.`,
    pads.length ? `Bend pads: ${pads.map(p => p.value).join('  ')}` : '',
  ].filter(Boolean)
  const text = notes
    .map(
      (n, i) =>
        `<text class="sub" x="20" y="${foot + i * 16}">${esc(n)}</text>`,
    )
    .join('')
  const height = foot + notes.length * 16 + 12
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-label="${esc(title)}"><style>${STYLE}</style><rect class="bg" width="100%" height="100%"/><text class="head" x="20" y="30">${esc(title)}</text>${placed.join('')}${text}</svg>\n`
}

interface Node {
  id: string
  x: number
  y: number
  w?: number
  title: string
  sub: string[]
}

const NODE_W = 210
const NODE_H = 78

const NODES: Node[] = [
  {
    id: 'pwr',
    x: 20,
    y: 60,
    title: 'Supply',
    sub: ['3 x AA or 5 V jack', 'starve rheostat -> VCC'],
  },
  {
    id: 'clk',
    x: 280,
    y: 60,
    title: 'RC clock  U1',
    sub: ['74HC14 + clock pot', '3.6 MHz  MCLK'],
  },
  {
    id: 'tempo',
    x: 540,
    y: 60,
    title: 'Tempo  U2 U3',
    sub: ['2 x 4040, 4 taps', '/2^18 .. /2^21  -> STEP'],
  },
  {
    id: 'step',
    x: 800,
    y: 60,
    title: 'Step counter  U4',
    sub: ['5 bit, loop reset', 'STEP0..4'],
  },
  {
    id: 'rom',
    x: 1060,
    y: 60,
    title: 'Tune ROM  U5',
    sub: ['AT28C64B, 32 steps', 'bank DIP, cut jumpers'],
  },
  {
    id: 'keys',
    x: 20,
    y: 200,
    title: 'Keys  U6 U7 U8',
    sub: ['12 keys, 2 x 148', 'priority: highest wins'],
  },
  {
    id: 'mux',
    x: 540,
    y: 200,
    title: 'Note select  U9 U10',
    sub: ['key overrides tune', 'code = octave(2) semitone(4)'],
  },
  {
    id: 'latch',
    x: 800,
    y: 200,
    title: 'Latch  U15',
    sub: ['transparent while G', 'holds across hold/rest'],
  },
  {
    id: 'semi',
    x: 1060,
    y: 200,
    title: 'Semitone ROM  U16',
    sub: ['AT28C64B', 'code -> 8 bit preload'],
  },
  {
    id: 'div',
    x: 1060,
    y: 340,
    title: 'Divider  U21 U22 U23',
    sub: ['2 x 161 reload to TC', 'f = MCLK / N, N 136..256'],
  },
  {
    id: 'oct',
    x: 800,
    y: 340,
    title: 'Octave  U18 U17',
    sub: ['/8 /4 /2 /1 tap', 'picked by LC4 LC5'],
  },
  {
    id: 'tone',
    x: 540,
    y: 340,
    title: 'Tone  U18 U19 U20',
    sub: ['/16 then AND taps', '50, 25, 12.5, 6.25 %'],
  },
  {
    id: 'env',
    x: 280,
    y: 340,
    title: 'Envelope',
    sub: ['G charges C4 via D1', 'decay pot, KILL on rest'],
  },
  {
    id: 'vca',
    x: 280,
    y: 480,
    title: 'Level  U24 U25',
    sub: ['pulse switches buffered', 'envelope to the output'],
  },
  {
    id: 'amp',
    x: 540,
    y: 480,
    title: 'Amp  U26',
    sub: ['LM386, gain 20', 'level pot, line out'],
  },
  {
    id: 'spk',
    x: 800,
    y: 480,
    title: 'Speaker',
    sub: ['8 ohm', 'line out jack'],
  },
]

const EDGES: [string, string, string, 'h' | 'v'][] = [
  ['pwr', 'clk', 'VCC', 'h'],
  ['clk', 'tempo', 'MCLK', 'h'],
  ['tempo', 'step', 'STEP', 'h'],
  ['step', 'rom', 'A0..4', 'h'],
  ['rom', 'semi', '', 'v'],
  ['keys', 'mux', 'KS0..3', 'h'],
  ['mux', 'latch', 'MC0..5', 'h'],
  ['latch', 'semi', 'LC0..3', 'h'],
  ['semi', 'div', 'PRE0..7', 'v'],
  ['div', 'oct', 'TCP', 'h'],
  ['oct', 'tone', 'OCTCLK', 'h'],
  ['tone', 'env', '', 'h'],
  ['env', 'vca', 'ENV', 'v'],
  ['vca', 'amp', 'SIG', 'h'],
  ['amp', 'spk', 'SPKOUT', 'h'],
]

const arrow = (x1: number, y1: number, x2: number, y2: number) => {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const tip = [
    [x2, y2],
    [x2 - 9 * ux - 4 * uy, y2 - 9 * uy + 4 * ux],
    [x2 - 9 * ux + 4 * uy, y2 - 9 * uy - 4 * ux],
  ]
  return `<path class="arrow" d="M${x1} ${y1} L${x2} ${y2}"/><polygon class="tip" points="${tip.map(p => p.join(',')).join(' ')}"/>`
}

export function blockSvg(): string {
  const byId = new Map(NODES.map(n => [n.id, n]))
  const parts: string[] = []
  for (const [a, c, label, kind] of EDGES) {
    const from = byId.get(a)!
    const to = byId.get(c)!
    if (kind === 'v') {
      const x = from.x + NODE_W / 2
      const y1 = from.y + NODE_H
      const y2 = to.y
      parts.push(arrow(x, y1, x, y2))
      parts.push(
        `<text class="net" x="${x + 6}" y="${(y1 + y2) / 2 + 4}">${esc(label)}</text>`,
      )
      continue
    }
    const right = to.x > from.x
    const x1 = right ? from.x + NODE_W : from.x
    const x2 = right ? to.x : to.x + NODE_W
    const y = from.y + NODE_H / 2
    parts.push(arrow(x1, y, x2, y))
    parts.push(
      `<text class="net" x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="middle">${esc(label)}</text>`,
    )
  }
  for (const n of NODES) {
    parts.push(
      `<rect class="box" x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="6"/><text class="title" x="${n.x + 12}" y="${n.y + 24}">${esc(n.title)}</text>`,
    )
    n.sub.forEach((s, i) =>
      parts.push(
        `<text class="sub" x="${n.x + 12}" y="${n.y + 46 + i * 16}">${esc(s)}</text>`,
      ),
    )
  }
  parts.push(
    `<text class="sub" x="20" y="600">Gate G (a key down, or the step edge on a note) opens the latch and charges the envelope. Every IC also takes VCC and GND.</text>`,
  )
  const height = 620
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1300 ${height}" width="1300" height="${height}" role="img" aria-label="Toy board block diagram"><style>${STYLE}</style><rect class="bg" width="100%" height="100%"/><text class="head" x="20" y="34">Toy board</text>${parts.join('')}</svg>\n`
}

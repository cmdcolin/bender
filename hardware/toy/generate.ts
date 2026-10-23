import { ROMS } from '../../src/dsp/stages/roms.ts'
import { buildBoard, SHEETS, type Board } from './board.ts'
import { erc } from './erc.ts'
import { semitoneImage, tempoHz, tuneImage } from './roms.ts'
import { blockSvg, sheetSvg } from './svg.ts'

const MASTER_HZ = 3.6e6
const TAPS = [18, 19, 20, 21]

const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`

const PINTYPE = {
  i: 'input',
  o: 'output',
  io: 'bidirectional',
  p: 'passive',
  v: 'power_in',
}

function kicadNet(board: Board): string {
  const parts = [...board.parts.values()]
  const nets = new Map<string, string[]>()
  for (const p of parts)
    for (const pin of p.def.pins) {
      const net = p.conn.get(pin.name)
      if (net === undefined) continue
      const node = `(node (ref ${q(p.ref)}) (pin ${q(pin.num)}) (pinfunction ${q(pin.name)}) (pintype ${q(PINTYPE[pin.dir])}))`
      nets.set(net, [...(nets.get(net) ?? []), node])
    }
  const comps = parts.map(
    p =>
      `    (comp (ref ${q(p.ref)}) (value ${q(p.value)}) (footprint ${q(p.def.footprint)}) (libsource (lib "toy") (part ${q(p.type)}) (description "")))`,
  )
  const netList = [...nets].map(
    ([name, nodes], i) =>
      `    (net (code ${q(String(i + 1))}) (name ${q(name)})\n      ${nodes.join('\n      ')})`,
  )
  return `(export (version "E")\n  (design (source "toy.net") (tool "hardware/toy/build.ts"))\n  (components\n${comps.join('\n')})\n  (nets\n${netList.join('\n')}))\n`
}

function bom(board: Board): string {
  const rows = new Map<
    string,
    { refs: string[]; value: string; footprint: string }
  >()
  for (const p of board.parts.values()) {
    if (p.type === 'PAD') continue
    const key = `${p.type}|${p.value}|${p.def.footprint}`
    const row = rows.get(key) ?? {
      refs: [],
      value: p.value,
      footprint: p.def.footprint,
    }
    row.refs.push(p.ref)
    rows.set(key, row)
  }
  const lines = [...rows].map(([key, r]) => {
    const type = key.split('|')[0]!
    return [r.refs.length, r.refs.join(' '), type, r.value, r.footprint]
      .map(c => `"${c}"`)
      .join(',')
  })
  return ['"qty","refs","part","value","footprint"', ...lines].join('\n') + '\n'
}

function tuneList(): string {
  const taps = TAPS.map(t => ({ t, hz: tempoHz(MASTER_HZ, t) }))
  const lines = ROMS.map((rom, bank) => {
    const err = (hz: number) => Math.abs(Math.log(hz / rom.stepHz))
    const best = taps.reduce((a, b) => (err(b.hz) < err(a.hz) ? b : a))
    const dip = [0, 1, 2, 3, 4]
      .map(i => ((bank >> i) & 1 ? 'on' : 'off'))
      .join(' ')
    return `${String(bank).padStart(2)}  ${rom.name.padEnd(13)} ${String(rom.stepHz).padStart(4)} Hz  /2^${best.t} = ${best.hz.toFixed(1)} Hz  DIP 1-5: ${dip}`
  })
  return `bank  tune          app rate  nearest tempo tap (master ${MASTER_HZ / 1e6} MHz)\n${lines.join('\n')}\n`
}

export function generate(): Record<string, string | Uint8Array> {
  const board = buildBoard()
  const errors = erc(board)
  if (errors.length) throw new Error(errors.join('\n'))
  return {
    'toy.net': kicadNet(board),
    'bom.csv': bom(board),
    'rom/tunes.bin': tuneImage(),
    'rom/semitones.bin': semitoneImage(),
    'rom/tunes.txt': tuneList(),
    'block.svg': blockSvg(),
    ...Object.fromEntries(
      SHEETS.map(sheet => [`sheet-${sheet.id}.svg`, sheetSvg(board, sheet.id)]),
    ),
  }
}

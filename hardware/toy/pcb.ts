import { buildBoard } from './board.ts'

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// FREEROUTING_JAR names a Freerouting 2.x jar that runs on the local Java.
// The jar is not in the repo, and a run takes about ten minutes a round.
const ROUNDS = 3
const root = join(dirname(fileURLToPath(import.meta.url)), 'pcb')
const work = join(root, '.build')
const board = join(root, 'toy.kicad_pcb')
const gerbers = join(root, 'gerbers')
mkdirSync(work, { recursive: true })

const spec = buildBoard()
const parts = [...spec.parts.values()].map(p => ({
  ref: p.ref,
  value: p.value,
  footprint: p.def.footprint,
  sheet: p.sheet,
  ic: !p.def.passive,
  decouples: p.decouples ?? '',
  pads: Object.fromEntries(
    p.def.pins.flatMap(pin => {
      const net = p.conn.get(pin.name)
      return net === undefined ? [] : [[pin.num, net]]
    }),
  ),
}))
writeFileSync(join(work, 'parts.json'), JSON.stringify({ parts }))

const run = (cmd: string, ...args: string[]) =>
  execFileSync(cmd, args, { stdio: 'inherit' })
const py = (script: string, ...args: string[]) =>
  run('python3', join(root, script), ...args)

interface Item {
  description: string
}
interface Report {
  unconnected_items: { items: Item[] }[]
}

const signalGaps = (pcb: string) => {
  const out = join(work, 'drc.json')
  run('kicad-cli', 'pcb', 'drc', '--format', 'json', '--output', out, pcb)
  const report: Report = JSON.parse(readFileSync(out, 'utf8'))
  return report.unconnected_items.filter(u =>
    u.items.some(i => !i.description.includes('[GND]')),
  ).length
}

const jar = process.env.FREEROUTING_JAR
if (!jar) throw new Error('set FREEROUTING_JAR to a Freerouting 2.x jar')

const placed = join(work, 'placed.kicad_pcb')
let current = placed
py('place.py', join(work, 'parts.json'), placed)
for (let round = 1; round <= ROUNDS; round++) {
  const dsn = join(work, `round${round}.dsn`)
  const ses = join(work, `round${round}.ses`)
  const routed = join(work, `round${round}.kicad_pcb`)
  py('dsn.py', current, dsn)
  run(
    'java',
    '-jar',
    jar,
    '-de',
    dsn,
    '-do',
    ses,
    '-mp',
    '40',
    '--gui.enabled=false',
  )
  py('finish.py', placed, ses, routed, 'route')
  current = routed
  const gaps = signalGaps(current)
  console.log(`round ${round}: ${gaps} signal connections open`)
  if (gaps === 0) break
}

py('finish.py', current, '-', board, 'pour')
mkdirSync(gerbers, { recursive: true })
run(
  'kicad-cli',
  'pcb',
  'export',
  'gerbers',
  '--output',
  gerbers,
  '--layers',
  'F.Cu,B.Cu,F.Silkscreen,B.Silkscreen,F.Mask,B.Mask,Edge.Cuts',
  board,
)
run('kicad-cli', 'pcb', 'export', 'drill', '--output', `${gerbers}/`, board)
run(
  'kicad-cli',
  'pcb',
  'drc',
  '--output',
  join(root, 'drc.txt'),
  '--format',
  'report',
  '--severity-all',
  board,
)

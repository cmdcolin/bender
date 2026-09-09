// Which paths in the kit actually reach the output, measured by taking each one
// out and listening to what changed.
//
//   pnpm audible           every path
//   pnpm audible kick      the paths whose board is named for one voice
//
// `knife.ts` asks whether a wire does anything and `spectrum.ts` asks what kind
// of sound it makes. This asks a question neither of them can: whether a branch
// of the summing junction is connected at all. Those are not the same question,
// because a path can be soldered in, cost a multiply a sample, carry a constant
// somebody tuned by ear and a paragraph explaining it, and still be inaudible —
// and nothing that renders the board once can tell.
//
// The kick's coupling cap was exactly that. It was two low-passes subtracted
// where a cap wanted a high-pass, so the band it passed and the band a one-shot
// puts out did not overlap, and the whole table could be zeroed without moving
// the take by a hundredth of a decibel. Every test went on passing, because the
// one covering it asserted on a number 50 dB down in the converter's own hash.
//
// Two numbers per path, and the second is the point. `rms` is how far the whole
// take moved, which is the number knife reports and the number that hid this
// bug: a click is three milliseconds long and a render is a second, so a path
// that owns the attack outright moves the take's rms by a fraction of a percent.
// `peak` is the tallest sample of the difference against the tallest sample of
// the take, which is what a transient path actually does. A dead path is one
// where both are nothing; a percussive one is small in the first column and
// large in the second, and that asymmetry is not a fault.
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Controls } from '../src/controls'
import { EMPTY_MASKS } from '../src/drums'

// A voice on its own with the pedals out of the way, so what moves is the kit
// and not the room. One hit per render at the top of a bar the render reaches.
const SOLO: Partial<Controls> = {
  ...EMPTY_MASKS,
  chipLevel: 0,
  fmLevel: 0,
  drumLevel: 0.7,
  drumBpm: 60,
  tapeMix: 0,
  revMix: 0,
  dlyMix: 0,
  distMix: 0,
}

const hit = (voice: keyof Controls, over: Partial<Controls> = {}) => ({
  ...SOLO,
  [voice]: 1 << 14,
  ...over,
})

/** One path, and the edit that takes it out of the circuit. `find` has to match
    the file exactly once — a substitution that matched nothing would report the
    path as alive on the strength of having done nothing at all, which is the
    failure this script exists to catch. */
interface Path {
  name: string
  file: string
  find: string
  kill: string
  board: Partial<Controls>
  seconds?: number
}

const DRUM = 'src/dsp/stages/toyDrum.ts'
const METAL = 'src/dsp/util/metal.ts'

const PATHS: Path[] = [
  {
    name: 'kick · coupling cap',
    file: DRUM,
    find: 'const CLICK = [0.9, 0.45, 0, 0, 0.7, 0, 0, 0]',
    kill: 'const CLICK = [0, 0, 0, 0, 0, 0, 0, 0]',
    board: hit('drumKick'),
  },
  {
    name: 'kick · the stage behind it',
    file: DRUM,
    find: 'const CLICK_GAIN = 3.1',
    kill: 'const CLICK_GAIN = 0',
    board: hit('drumKick'),
  },
  {
    name: 'snare · noise off the transistor',
    file: DRUM,
    find: 'const SNARE_NOISE = 1.33',
    kill: 'const SNARE_NOISE = 0',
    board: hit('drumSnare'),
  },
  {
    name: 'snare · its band under the lid',
    file: DRUM,
    find: 'const SNARE_HP = 400',
    kill: 'const SNARE_HP = 1',
    board: hit('drumSnare', { drumSnappy: 1 }),
  },
  {
    name: 'kit · the lid on the transistor',
    file: DRUM,
    find: 'const NOISE_LID = 9500',
    kill: 'const NOISE_LID = 20000',
    board: hit('drumSnare', { drumSnappy: 1 }),
  },
  {
    name: 'hat · noise side of the pot',
    file: DRUM,
    find: 'const HAT_NOISE = 0.65',
    kill: 'const HAT_NOISE = 0',
    board: hit('drumHat', { drumMetal: 0 }),
  },
  {
    name: 'hat · bank side of the pot',
    file: DRUM,
    find: 'const HAT_METAL = 7.8',
    kill: 'const HAT_METAL = 0',
    board: hit('drumHat', { drumMetal: 1 }),
  },
  {
    name: 'hat · the lid over the bank',
    file: DRUM,
    find: 'const HAT_LP = CYM_LP',
    kill: 'const HAT_LP = 24000',
    board: hit('drumHat', { drumMetal: 1 }),
  },
  {
    name: 'clap · its own network',
    file: DRUM,
    find: 'const CLAP_HP = 390',
    kill: 'const CLAP_HP = 1',
    board: hit('drumClap'),
  },
  {
    name: 'bell · the corner under the pair',
    file: DRUM,
    find: 'const BELL_HP = 500',
    kill: 'const BELL_HP = 1',
    board: hit('drumBell'),
  },
  {
    name: 'bell · what it is worth in the sum',
    file: DRUM,
    find: 'const BELL_GAIN = 0.3',
    kill: 'const BELL_GAIN = 0',
    board: hit('drumBell'),
  },
  {
    name: 'cymbal · the crash tap',
    file: DRUM,
    find: 'const CYM_CRASH_GAIN = 1.27',
    kill: 'const CYM_CRASH_GAIN = 0',
    board: hit('drumCym', { drumCymTone: 0 }),
    seconds: 1.6,
  },
  {
    name: 'cymbal · the splash tap',
    file: DRUM,
    find: 'const CYM_SPLASH_GAIN = 11.0',
    kill: 'const CYM_SPLASH_GAIN = 0',
    board: hit('drumCym', { drumCymTone: 1 }),
    seconds: 1.6,
  },
  {
    name: 'bank · the stage that squares the sum',
    file: METAL,
    find: 'const SQUARE_MAX = N_METAL / 2',
    kill: 'const SQUARE_MAX = SQUARE_MIN',
    board: hit('drumCym'),
    seconds: 1.6,
  },
  {
    name: 'bank · the spread trimmer',
    file: METAL,
    find: 'const SPREAD_OCT = 0.4',
    kill: 'const SPREAD_OCT = 0',
    board: hit('drumBell', { drumSpread: 1 }),
  },
  // The bends. Each needs its own knob up, or what is being measured is a path
  // nobody asked for anything from.
  {
    name: 'converter · the resistor ladder',
    file: DRUM,
    find: 'const LADDER_FLOOR = 0.4',
    kill: 'const LADDER_FLOOR = 0',
    board: hit('drumKick', { drumLadder: 1, drumLadderTol: 0.6, drumBits: 4 }),
  },
  {
    name: 'transistor · popcorn latching',
    file: DRUM,
    find: 'const BURST_LONG = 0.08',
    kill: 'const BURST_LONG = BURST_SHORT',
    board: hit('drumSnare', { drumSnappy: 1, drumNoiseBias: 0.15 }),
  },
  {
    name: 'one-shot · the edge on its rise',
    file: DRUM,
    find: 'const PULSE_EDGE = 2.5',
    kill: 'const PULSE_EDGE = 200',
    board: hit('drumKick', { drumPulse: 0.05 }),
  },
]

// The tree the mutants are rendered from, so nothing here writes to the repo —
// another agent may well be working in it, and a script that edits src/ to make
// a measurement is a script that loses somebody else's afternoon.
const root = process.cwd()
const tree = mkdtempSync(join(tmpdir(), 'bender-audible-'))
cpSync(join(root, 'src'), join(tree, 'src'), { recursive: true })

const RENDER = join(tree, 'render.ts')
writeFileSync(
  RENDER,
  `import { writeFileSync } from 'node:fs'
import { DEFAULT_CONTROLS } from './src/controls'
import { render } from './src/dsp/testRender'
const [out, board, seconds] = process.argv.slice(2)
const x = render({ ...DEFAULT_CONTROLS, ...JSON.parse(board!) }, Number(seconds))
writeFileSync(out!, Buffer.from(x.buffer))
`,
)

const tsx = join(root, 'node_modules', '.bin', 'tsx')
const take = (board: Partial<Controls>, seconds: number) => {
  const out = join(tree, 'take.f32')
  execFileSync(tsx, [RENDER, out, JSON.stringify(board), String(seconds)], {
    cwd: tree,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return new Float32Array(readFileSync(out).buffer.slice(0))
}

const pristine = new Map<string, string>()
for (const file of new Set(PATHS.map(p => p.file)))
  pristine.set(file, readFileSync(join(root, file), 'utf8'))

const restore = () => {
  for (const [file, text] of pristine) writeFileSync(join(tree, file), text)
}

const peak = (x: Float32Array) =>
  x.reduce((a, v) => Math.max(a, Math.abs(v)), 0)
const rms = (x: Float32Array) =>
  Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length)

// Under a thousandth on both columns is a branch nobody would hear cut. Under a
// fiftieth is the more interesting report: a path that is connected, and so
// passes any test that only asks whether it does *something*, while carrying so
// little that the thing it was built to do is not what you are hearing. The
// coupling cap read 0.015 in the peak column wired as a band and 0.088 wired as
// a cap — both non-zero, and only one of them a click.
const DEAD = 1e-3
const THIN = 0.02

const only = process.argv[2]
const dead: string[] = []
const faint: string[] = []

console.log(
  `  ${'path'.padEnd(38)}${'rms'.padStart(9)}${'peak'.padStart(9)}   ${'at ms'.padStart(7)}`,
)

for (const path of PATHS) {
  if (only && !path.name.includes(only)) continue
  const seconds = path.seconds ?? 1.2
  restore()
  const base = take(path.board, seconds)

  const text = pristine.get(path.file)!
  const cuts = text.split(path.find).length - 1
  if (cuts !== 1) {
    console.log(
      `  ${path.name.padEnd(38)}  — \`${path.find}\` matched ${cuts}× in ${path.file}`,
    )
    dead.push(`${path.name} (the edit no longer matches: rewrite it)`)
    continue
  }
  writeFileSync(join(tree, path.file), text.replace(path.find, path.kill))
  const cut = take(path.board, seconds)

  const diff = base.map((v, i) => v - cut[i]!)
  const moved = rms(diff) / (rms(base) + 1e-12)
  const spike = peak(diff) / (peak(base) + 1e-12)
  let at = 0
  for (let i = 0; i < diff.length; i++)
    if (Math.abs(diff[i]!) > Math.abs(diff[at]!)) at = i
  if (moved < DEAD && spike < DEAD) dead.push(path.name)
  else if (moved < THIN && spike < THIN)
    faint.push(`${path.name} (${spike.toFixed(5)} of the peak)`)
  console.log(
    `  ${path.name.padEnd(38)}${moved.toFixed(5).padStart(9)}${spike.toFixed(5).padStart(9)}   ${((at / 48000) * 1000).toFixed(1).padStart(7)}`,
  )
}

restore()
rmSync(tree, { recursive: true, force: true })

if (dead.length > 0) {
  console.log(
    `\n${dead.length} path${dead.length > 1 ? 's' : ''} nothing hears:`,
  )
  for (const line of dead) console.log(`  ${line}`)
}
if (faint.length > 0) {
  console.log(
    `\n${faint.length} path${faint.length > 1 ? 's' : ''} barely there:`,
  )
  for (const line of faint) console.log(`  ${line}`)
}
if (dead.length === 0 && faint.length === 0)
  console.log('\nEvery path reaches the output.')
else process.exitCode = 1

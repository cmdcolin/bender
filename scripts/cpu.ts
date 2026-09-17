import { preview } from 'astro'

import config from '../astro.config'
import { DEFAULT_CONTROLS, type Controls } from '../src/controls'
import { encodeControls } from '../src/ui/share'
import { HEAVY } from './boards'
import { attach, chromePath, sleep, type Page } from './chrome'
import { buildAndPreview } from './serve'

// CPU time the app costs every Chrome thread, and the underruns Chrome counted
// while it ran. `pnpm panel` reads the main thread's timeline; this reads
// /proc, so it also sees the audio thread, the compositor and the GPU process.
//
//   pnpm cpu                       heavy board playing, 20 s
//   pnpm cpu 20 idle,stock,heavy   several scenes in turn
//   pnpm cpu 20 hidden             heavy board playing in a background tab
//
// BENDER_BUILT=dirA,dirB serves prebuilt sites instead of building this tree,
// and BENDER_ROUNDS alternates between them, so a before and after meet the
// same machine state. Linux only: run time and timeslices come from
// /proc/<pid>/task/<tid>/schedstat.
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCENES = ['heavy', 'idle', 'stock', 'hidden'] as const
type Scene = (typeof SCENES)[number]

const seconds = Number(process.argv[2] ?? 20)
const scenes = (process.argv[3] ?? 'heavy').split(',') as Scene[]
if (
  !Number.isFinite(seconds) ||
  seconds <= 0 ||
  !scenes.every(s => SCENES.includes(s))
)
  throw new Error(`usage: pnpm cpu [seconds] [${SCENES.join(',')}]`)
const rounds = Number(process.env.BENDER_ROUNDS ?? 1)

const PORT = 5199
const DEBUG_PORT = 9335

const TAPE: Controls = {
  ...DEFAULT_CONTROLS,
  ...HEAVY,
  loopRec: 0.6,
  sampleLevel: 0.6,
}
const BOARDS: Record<Scene, Controls> = {
  heavy: TAPE,
  hidden: TAPE,
  stock: DEFAULT_CONTROLS,
  idle: DEFAULT_CONTROLS,
}

const RECORD_CONTEXTS = `(() => {
  const Base = window.AudioContext
  window.__contexts = []
  window.AudioContext = class extends Base {
    constructor(options) {
      super(options)
      window.__contexts.push(this)
    }
  }
})()`

const STATS = `(() => {
  const s = window.__contexts?.[0]?.playbackStats
  return s ? { events: s.underrunEvents, secs: s.underrunDuration, total: s.totalDuration } : null
})()`

interface Usage {
  runNs: number
  slices: number
}

interface Thread extends Usage {
  kind: string
  name: string
}

interface Underruns {
  events: number
  secs: number
  total: number
}

function kindOf(pid: number): string {
  const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split(/[\0 ]/)
  const type = argv.find(a => a.startsWith('--type='))?.slice(7)
  if (!type) return 'browser'
  const sub = argv.find(a => a.startsWith('--utility-sub-type='))?.slice(19)
  return sub ? `utility:${sub.replace(/\.mojom\..*/, '')}` : type
}

function descendants(root: number): number[] {
  const children = new Map<number, number[]>()
  for (const entry of readdirSync('/proc')) {
    const pid = Number(entry)
    if (!Number.isInteger(pid)) continue
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
      children.set(ppid, [...(children.get(ppid) ?? []), pid])
    } catch {}
  }
  const out: number[] = []
  const walk = (pid: number) => {
    out.push(pid)
    for (const c of children.get(pid) ?? []) walk(c)
  }
  walk(root)
  return out
}

function snapshot(root: number): Map<string, Thread> {
  const threads = new Map<string, Thread>()
  for (const pid of descendants(root)) {
    try {
      const kind = kindOf(pid)
      for (const tid of readdirSync(`/proc/${pid}/task`)) {
        const at = `/proc/${pid}/task/${tid}`
        const name = readFileSync(`${at}/comm`, 'utf8').trim()
        const [runNs, , slices] = readFileSync(`${at}/schedstat`, 'utf8')
          .trim()
          .split(' ')
          .map(Number)
        threads.set(`${pid}/${tid}`, {
          kind,
          name,
          runNs: runNs!,
          slices: slices!,
        })
      }
    } catch {}
  }
  return threads
}

const ask = async (page: Page, expression: string) => {
  const { result, exceptionDetails } = await page.send<{
    result: { value?: unknown }
    exceptionDetails?: { text: string }
  }>('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (exceptionDetails)
    throw new Error(`${expression}: ${exceptionDetails.text}`)
  return result.value
}

const press = (page: Page, text: string) =>
  ask(
    page,
    `[...document.querySelectorAll('button')].find(e => (e.textContent ?? '').trim().toLowerCase().includes(${JSON.stringify(text)}))?.click()`,
  )

// The threads worth a column. Everything else Chrome runs is the browser's own
// business and moves with whatever the profile is doing in the background.
const COLUMNS: [string, (t: Thread) => boolean][] = [
  ['audio', t => t.kind === 'renderer' && t.name.startsWith('Realtime Audio')],
  ['main', t => t.kind === 'renderer' && t.name === 'chrome'],
  ['compositor', t => t.kind === 'renderer' && t.name === 'Compositor'],
  ['raster', t => t.kind === 'renderer' && t.name.startsWith('ThreadPool')],
  ['gpu', t => t.kind === 'gpu-process' && t.name === 'chrome'],
  ['viz', t => t.kind === 'gpu-process' && t.name.startsWith('VizComp')],
]

type Row = Record<string, Usage>

function usage(before: Map<string, Thread>, after: Map<string, Thread>): Row {
  const row: Row = { renderer: { runNs: 0, slices: 0 } }
  for (const [name] of COLUMNS) row[name] = { runNs: 0, slices: 0 }
  row['gpu-process'] = { runNs: 0, slices: 0 }
  for (const [key, t] of after) {
    const was = before.get(key)
    const runNs = t.runNs - (was?.runNs ?? 0)
    const slices = t.slices - (was?.slices ?? 0)
    for (const [name, match] of COLUMNS) {
      if (!match(t)) continue
      row[name]!.runNs += runNs
      row[name]!.slices += slices
    }
    const k = row[t.kind]
    if (k) {
      k.runNs += runNs
      k.slices += slices
    }
  }
  return row
}

async function session(url: string, scene: Scene) {
  const profile = mkdtempSync(join(tmpdir(), 'bender-cpu-chrome-'))
  const chrome = spawn(
    chromePath(),
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1600,1000',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  try {
    const page = await attach(DEBUG_PORT)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: RECORD_CONTEXTS,
    })
    await page.send('Page.navigate', {
      url: `${url}#set=${encodeControls(BOARDS[scene])}`,
    })
    await sleep(3000)
    await ask(page, `window.bender.start()`)
    if (scene !== 'idle') {
      await press(page, 'play demo song')
      await press(page, 'play drums')
    }
    if (scene === 'hidden')
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, {
        method: 'PUT',
      })
    await sleep(4000)
    const statsBefore = (await ask(page, STATS)) as Underruns | null
    const before = snapshot(chrome.pid!)
    await sleep(seconds * 1000)
    const after = snapshot(chrome.pid!)
    const statsAfter = (await ask(page, STATS)) as Underruns | null
    page.close()
    const underruns =
      statsBefore && statsAfter
        ? {
            events: statsAfter.events - statsBefore.events,
            secs: statsAfter.secs - statsBefore.secs,
          }
        : null
    return { row: usage(before, after), underruns }
  } finally {
    const gone = new Promise(r => chrome.on('exit', r))
    chrome.kill()
    await gone
    rmSync(profile, { recursive: true, force: true })
  }
}

async function serve(dir: string) {
  const server = await preview({
    outDir: dir,
    logLevel: 'warn',
    server: { port: PORT },
  })
  return {
    url: `http://localhost:${server.port}${config.base ?? ''}/app/`,
    stop: () => server.stop(),
  }
}

const pct = (u: Usage) => ((u.runNs / (seconds * 1e9)) * 100).toFixed(1)

const HEAD = [
  'audio',
  'main',
  'compositor',
  'raster',
  'gpu',
  'viz',
  'renderer',
  'gpu-process',
]

function line(
  label: string,
  row: Row,
  underruns: Pick<Underruns, 'events' | 'secs'> | null,
) {
  const cells = HEAD.map(h => pct(row[h]!).padStart(h.length))
  const wake = (row.renderer!.slices / seconds).toFixed(0)
  const lost = underruns
    ? `${underruns.events} (${(underruns.secs * 1000).toFixed(0)} ms)`
    : 'n/a'
  console.log(
    `${label.padEnd(28)} ${cells.join('  ')}  ${wake.padStart(9)}  ${lost}`,
  )
}

async function main() {
  const dirs = process.env.BENDER_BUILT?.split(',') ?? []
  console.log(
    `% of one core over ${seconds}s; wakeups are renderer timeslices a second; underruns as Chrome counted them`,
  )
  console.log(
    `${'run'.padEnd(28)} ${HEAD.join('  ')}  ${'wakeups/s'}  underruns`,
  )
  if (dirs.length === 0) {
    const served = await buildAndPreview(PORT, { minify: true })
    try {
      for (let r = 0; r < rounds; r++)
        for (const scene of scenes) {
          const { row, underruns } = await session(served.url, scene)
          line(scene, row, underruns)
        }
    } finally {
      await served.stop()
    }
    return
  }
  for (let r = 0; r < rounds; r++)
    for (const scene of scenes)
      for (const dir of r % 2 === 0 ? dirs : [...dirs].reverse()) {
        const served = await serve(dir)
        try {
          const { row, underruns } = await session(served.url, scene)
          line(`${scene} ${dir.split('/').pop()}`, row, underruns)
        } finally {
          await served.stop()
        }
      }
}

await main()

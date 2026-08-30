// What the panel costs the *browser's* main thread, and which part of a frame
// it costs it in.
//
//   pnpm panel              the heavy board playing, 8 s
//   pnpm panel 12 morph     the same with a board travelling for 30 s
//   pnpm panel 8 drag       a slider held and swept
//
// The audio scripts beside this one render the chain offline in node, where the
// panel does not exist. Nothing they report can see a style write, and a style
// write is what the panel is made of: eight widgets read the meter sixty times
// a second and write straight to the DOM, deliberately, because a React render
// to move one bar is a render the board can feel.
//
// So this drives the built app in a real Chrome and reads the timeline back.
// Production build, not the dev server: dev-mode React is a different program
// and its numbers describe nobody's session.
//
// The column to read is not the total, it is `layout`. Nothing on this panel
// changes the size or position of anything — the meters scale, the readouts are
// numbers of fixed width, the drawings are canvas. Layout should therefore be
// near zero, and layout that is *not* near zero means something is writing the
// DOM every frame whether or not it has anything new to say. That is what a
// `textContent =` on an unchanged word costs: the text node is swapped either
// way and the document is laid out again. See optimizations.md.
//
// The absolute numbers move with whatever else the machine is doing — a busy
// box moved these by 40% here. Run a before and after in the same sitting, and
// read the shape rather than the digits.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONTROLS, type Controls } from '../src/controls'
import { encodeControls } from '../src/ui/share'
import { attach, chromePath, sleep, type Page } from './chrome'
import { HEAVY } from './boards'

const seconds = Number(process.argv[2] ?? 8)
const scene = process.argv[3] ?? 'still'
if (!Number.isFinite(seconds) || seconds <= 0)
  throw new Error(`usage: pnpm panel [seconds] [still|morph|drag]`)
if (!['still', 'morph', 'drag', 'open', 'hover'].includes(scene))
  throw new Error(
    `no such scene '${scene}' — still, morph, drag, open or hover`,
  )
const PORT = 5198
const DEBUG_PORT = 9334
const FRAME_MS = 1000 / 60
// Thrown away off the front of every capture. Turning the tracer and the
// sampler on is itself a job of work on the thread being measured — it lands as
// one ~30 ms task at the head of every run — and reporting it would say the
// panel drops a frame it has never dropped.
const SETTLE_MS = 600

// The bench board with a tape threaded, so the reel is on screen: it is the
// busiest thing the panel draws off the meter, and a board that leaves it out
// measures a panel nobody has.
const BOARD: Controls = {
  ...DEFAULT_CONTROLS,
  ...HEAVY,
  loopRec: 0.6,
  sampleLevel: 0.6,
}

interface TraceEvent {
  name: string
  ph: string
  ts: number
  dur?: number
  tid?: number
}

interface ProfileNode {
  id: number
  callFrame: { functionName: string }
  children?: number[]
}

interface Profile {
  nodes: ProfileNode[]
  samples: number[]
  timeDeltas: number[]
}

// Every frame React puts on the stack sits under this one, so a sample with it
// anywhere below the top is a sample React is responsible for.
const REACT_ROOT = 'performWorkOnRoot'

function serve(dir: string) {
  // The url comes back out of what vite says rather than being assumed, so a
  // port already taken moves the server rather than stopping the run.
  const vite = spawn(
    'node_modules/.bin/vite',
    ['preview', '--outDir', dir, '--port', String(PORT)],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  return new Promise<{ url: string; stop: () => void }>((resolve, reject) => {
    let out = ''
    const die = setTimeout(() => reject(new Error('vite never served')), 30000)
    vite.stdout.on('data', (d: Buffer) => {
      out += d.toString()
      const hit = out.match(/(http:\/\/localhost:\d+\/)/)?.[1]
      if (hit) {
        clearTimeout(die)
        resolve({ url: hit, stop: () => vite.kill() })
      }
    })
  })
}

const ask = async (page: Page, expression: string) => {
  const { result, exceptionDetails } = await page.send<{
    result: { value?: unknown }
    exceptionDetails?: { text: string }
  }>('Runtime.evaluate', {
    expression,
    returnByValue: true,
    // A press dispatched from here is a press as far as the page is concerned,
    // which is what an AudioContext waits for.
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

const mouse = (page: Page, type: string, x: number, y: number) =>
  page.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'left',
    clickCount: 1,
  })

// A stage has to be open for there to be a slider at all — the map is doors
// until one is. Done before the trace starts, not inside it: opening a stage
// mounts a whole rack of controls and is the largest single render the panel
// ever does, so measured together it is the only thing you would see.
async function openStage(page: Page) {
  await ask(
    page,
    `document.querySelector('[data-door]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
  )
  await sleep(1200)
}

// A slider swept back and forth under a held pointer, which is the tightest
// loop the panel has: every move writes a control, and every control write
// wakes every widget subscribed to the board.
async function drag(page: Page, until: number) {
  const box = await ask(
    page,
    `(() => { const r = document.querySelector('aside input[type=range]')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null })()`,
  )
  if (typeof box !== 'object' || box === null)
    throw new Error('no slider on the panel to drag')
  const { x, y, w, h } = box as { x: number; y: number; w: number; h: number }
  const mid = y + h / 2
  await mouse(page, 'mousePressed', x + 4, mid)
  for (let i = 0; Date.now() < until; i++) {
    await mouse(page, 'mouseMoved', x + ((Math.sin(i / 10) + 1) / 2) * w, mid)
    await sleep(10)
  }
  await mouse(page, 'mouseReleased', x + w / 2, mid)
}

// Stage after stage off the map, which is how this panel is used: the drawing
// is an index and every box on it is a door. Mounting a rack of controls is the
// largest single render the app does, and one a hand asks for over and over.
async function stages(page: Page, until: number) {
  const doors = await ask(
    page,
    `[...document.querySelectorAll('[data-door]')].map(e => e.getAttribute('data-door'))`,
  )
  const names = (Array.isArray(doors) ? doors : []).filter(
    (n): n is string => typeof n === 'string',
  )
  if (names.length === 0) throw new Error('no doors on the map to open')
  for (let i = 0; Date.now() < until; i++) {
    const name = names[i % names.length]!
    await ask(
      page,
      `document.querySelector('[data-door=${JSON.stringify(name)}]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
    )
    await sleep(500)
  }
}

// A pointer resting on one control after another, long enough for each tip to
// come up. Nearly everything on this panel carries one, and a tip is the only
// thing here that measures and positions a box against another box.
async function hover(page: Page, until: number) {
  const spots = await ask(
    page,
    `[...document.querySelectorAll('aside label, aside button, aside input')].slice(0, 24).map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })`,
  )
  const at = (Array.isArray(spots) ? spots : []).filter(
    (p): p is { x: number; y: number } =>
      typeof p === 'object' && p !== null && 'x' in p && 'y' in p,
  )
  if (at.length === 0) throw new Error('nothing on the panel to hover')
  for (let i = 0; Date.now() < until; i++) {
    const spot = at[i % at.length]!
    await mouse(page, 'mouseMoved', spot.x, spot.y)
    await sleep(600)
  }
}

async function run(page: Page) {
  const until = Date.now() + seconds * 1000
  if (scene === 'drag') await drag(page, until)
  else if (scene === 'open') await stages(page, until)
  else if (scene === 'hover') await hover(page, until)
  else {
    if (scene === 'morph')
      await ask(
        page,
        `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'random').click()`,
      )
    await sleep(Math.max(until - Date.now(), 0))
  }
}

async function main() {
  const out = mkdtempSync(join(tmpdir(), 'bender-panel-'))
  const profile = mkdtempSync(join(tmpdir(), 'bender-panel-chrome-'))
  // Not minified. The report names which function was on the stack, and a
  // profile of `Sr` and `Ld` answers nothing — it is the same code either way,
  // and what this measures is where a frame goes rather than how long the
  // bundle takes to parse.
  const build = spawn(
    'node_modules/.bin/vite',
    ['build', '--minify', 'false', '--outDir', out],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let said = ''
  build.stdout.on('data', (d: Buffer) => (said += d.toString()))
  build.stderr.on('data', (d: Buffer) => (said += d.toString()))
  const built = await new Promise(r => build.on('exit', r))
  if (built !== 0) throw new Error(`build failed:\n${said}`)

  const { url, stop } = await serve(out)
  // Headed. Headless rasters through a different path, and paint is one of the
  // columns this is here to report.
  const chrome = spawn(
    chromePath(),
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1600,1000',
      `${url}#set=${encodeControls(BOARD)}`,
    ],
    { stdio: 'ignore' },
  )

  try {
    const page = await attach(DEBUG_PORT)
    await page.send('Runtime.enable')
    await sleep(2500)
    await mouse(page, 'mousePressed', 700, 950)
    await mouse(page, 'mouseReleased', 700, 950)
    await sleep(400)
    await press(page, 'play demo song')
    await press(page, 'play drums')
    if (scene === 'morph')
      await ask(
        page,
        `(() => { const s = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.startsWith('morph'))); s.value = '30'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`,
      )
    if (scene === 'drag' || scene === 'hover') await openStage(page)
    // Long enough for the tape to thread and the JIT to have seen every frame
    // callback a few hundred times, which is the state a session is in.
    await sleep(3000)

    const events: TraceEvent[] = []
    page.on('Tracing.dataCollected', params => {
      const { value } = (params ?? {}) as { value?: unknown[] }
      for (const raw of value ?? []) {
        const { name, ph, ts, dur, tid } = raw as Partial<TraceEvent>
        if (typeof name === 'string' && typeof ph === 'string' && ts)
          events.push({ name, ph, ts, dur, tid })
      }
    })
    const done = new Promise(r => page.on('Tracing.tracingComplete', r))
    await page.send('Tracing.start', {
      traceConfig: {
        includedCategories: [
          'devtools.timeline',
          'disabled-by-default-devtools.timeline',
        ],
      },
      transferMode: 'ReportEvents',
    })
    // Sampled beside the timeline, which says how long a frame took but not
    // whose work it was. The one question every reader of this asks first is
    // whether React is what costs, and that needs a stack.
    await page.send('Profiler.enable')
    await page.send('Profiler.setSamplingInterval', { interval: 100 })
    await page.send('Profiler.start')
    await sleep(SETTLE_MS)
    await run(page)
    const { profile } = await page.send<{ profile: Profile }>('Profiler.stop')
    await page.send('Tracing.end')
    await done
    page.close()
    report(events, profile)
  } finally {
    // Waited for, not just signalled: Chrome is still writing its profile
    // directory as it goes down, and a removal that races it fails on a
    // directory that is not empty yet.
    const gone = new Promise(r => chrome.on('exit', r))
    chrome.kill()
    await gone
    stop()
    rmSync(out, { recursive: true, force: true })
    rmSync(profile, { recursive: true, force: true })
  }
}

const quantile = (sorted: number[], f: number) =>
  sorted.length === 0
    ? 0
    : sorted[Math.min(Math.floor(f * sorted.length), sorted.length - 1)]!

// How much of the wall clock React was on the stack for, and — the number that
// decides whether it drops a frame — the longest unbroken stretch it held it.
// A render averaging half a millisecond a frame and a render that lands as one
// eight-millisecond burst are the same mean and different instruments.
function reactShare(profile: Profile) {
  const nodes = new Map(profile.nodes.map(n => [n.id, n]))
  const parent = new Map<number, number>()
  for (const n of profile.nodes)
    for (const c of n.children ?? []) parent.set(c, n.id)
  const isReact = new Map<number, boolean>()
  const reactAt = (id: number) => {
    const known = isReact.get(id)
    if (known !== undefined) return known
    let at: number | undefined = id
    let found = false
    while (at !== undefined && !found) {
      found = nodes.get(at)?.callFrame.functionName === REACT_ROOT
      at = parent.get(at)
    }
    isReact.set(id, found)
    return found
  }

  let wall = 0
  let mine = 0
  let burst = 0
  let since = 0
  const bursts: number[] = []
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = profile.timeDeltas[i] ?? 0
    since += dt
    if (since >= SETTLE_MS * 1000) {
      wall += dt
      if (reactAt(profile.samples[i]!)) {
        mine += dt
        burst += dt
      } else if (burst > 0) {
        bursts.push(burst / 1000)
        burst = 0
      }
    }
  }
  if (burst > 0) bursts.push(burst / 1000)
  bursts.sort((a, b) => a - b)
  return {
    ms: mine / 1000,
    share: wall === 0 ? 0 : mine / wall,
    longest: bursts.at(-1) ?? 0,
    p99: quantile(bursts, 0.99),
    count: bursts.length,
  }
}

function report(events: TraceEvent[], profile: Profile) {
  const began = Math.min(...events.map(e => e.ts)) + SETTLE_MS * 1000
  const spans = events.filter(e => e.ph === 'X' && e.ts >= began)
  // The renderer's main thread is the one the frame callbacks run on. The trace
  // carries the compositor and the GPU process too, and summing across them
  // reports a number no single thread ever had to find time for.
  const frames = new Map<number, number>()
  for (const e of spans)
    if (e.name === 'FireAnimationFrame' && e.tid !== undefined)
      frames.set(e.tid, (frames.get(e.tid) ?? 0) + 1)
  const main = [...frames].sort((a, b) => b[1] - a[1])[0]?.[0]
  const mine = spans.filter(e => e.tid === main)
  const commits = mine
    .filter(e => e.name === 'Commit')
    .sort((a, b) => a.ts - b.ts)
  const drawn = commits.length

  // A frame the compositor never got. The panel asks for one every 16.7 ms for
  // as long as it is up, so a gap of more than one and a half is a frame the
  // main thread was too busy to hand over.
  let dropped = 0
  for (let i = 1; i < commits.length; i++)
    if ((commits[i]!.ts - commits[i - 1]!.ts) / 1000 > FRAME_MS * 1.5) dropped++

  const total = (name: string) =>
    mine.filter(e => e.name === name).reduce((a, b) => a + (b.dur ?? 0), 0) /
    1000
  // Paint and FunctionCall nest inside themselves — the document's paint holds
  // the html element's, a handler holds whatever it calls — so only the
  // outermost of each run counts, or one frame is charged several times over.
  const outermost = (name: string) => {
    const all = mine.filter(e => e.name === name).sort((a, b) => a.ts - b.ts)
    let sum = 0
    let end = -1
    for (const e of all) {
      if (e.ts >= end) {
        sum += e.dur ?? 0
        end = e.ts + (e.dur ?? 0)
      }
    }
    return sum / 1000
  }

  const rows: [string, number][] = [
    ['js in frame callbacks', total('FireAnimationFrame')],
    ['style recalc', total('UpdateLayoutTree')],
    ['layout', total('Layout')],
    ['pre-paint', total('PrePaint')],
    ['paint', outermost('Paint')],
    ['layerize', total('Layerize')],
    ['commit to compositor', total('Commit')],
  ]
  const busy = total('RunTask')

  console.log(
    `panel: ${scene}, ${seconds}s, ${drawn} frames drawn (${(drawn / seconds).toFixed(0)}/s), ${dropped} dropped`,
  )
  console.log(
    `main thread busy ${busy.toFixed(0)}ms — ${(busy / drawn).toFixed(2)}ms of every ${FRAME_MS.toFixed(1)}ms frame, ${((busy / (seconds * 1000)) * 100).toFixed(1)}% of one core`,
  )
  for (const [label, ms] of rows)
    console.log(
      `  ${label.padEnd(22)} ${ms.toFixed(0).padStart(5)}ms  ${(ms / drawn).toFixed(3)}ms/frame`,
    )

  // The mean is not what drops a frame. One task that overruns the budget is a
  // frame the compositor never got, on a panel whose average looks idle.
  const tasks = mine
    .filter(e => e.name === 'RunTask')
    .map(e => (e.dur ?? 0) / 1000)
    .sort((a, b) => a - b)
  const over = tasks.filter(t => t > FRAME_MS).length
  console.log(
    `tasks: p50 ${quantile(tasks, 0.5).toFixed(2)}ms  p90 ${quantile(tasks, 0.9).toFixed(2)}ms  p99 ${quantile(tasks, 0.99).toFixed(2)}ms  max ${(tasks.at(-1) ?? 0).toFixed(2)}ms — ${over} over the frame`,
  )

  const react = reactShare(profile)
  console.log(
    `react: ${react.ms.toFixed(0)}ms, ${(react.share * 100).toFixed(1)}% of wall, over ${react.count} renders — p99 ${react.p99.toFixed(2)}ms, longest ${react.longest.toFixed(2)}ms`,
  )
}

await main()

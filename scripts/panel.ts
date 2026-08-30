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
const PORT = 5198
const DEBUG_PORT = 9334
const FRAME_MS = 1000 / 60

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

// A slider swept back and forth under a held pointer, which is the tightest
// loop the panel has: every move writes a control, and every control write
// wakes every widget subscribed to the board.
//
// A stage has to be open for there to be a slider at all — the map is doors
// until one is — so it opens the first door on the drawing, which is also the
// panel at its heaviest: a stage's whole rack of controls on screen under a
// board that is moving.
async function drag(page: Page, until: number) {
  await ask(
    page,
    `document.querySelector('[data-door]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
  )
  await sleep(800)
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

async function run(page: Page) {
  const until = Date.now() + seconds * 1000
  if (scene === 'drag') await drag(page, until)
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
  const build = spawn('node_modules/.bin/vite', ['build', '--outDir', out], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
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
    await run(page)
    await page.send('Tracing.end')
    await done
    page.close()
    report(events)
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

function report(events: TraceEvent[]) {
  const spans = events.filter(e => e.ph === 'X')
  // The renderer's main thread is the one the frame callbacks run on. The trace
  // carries the compositor and the GPU process too, and summing across them
  // reports a number no single thread ever had to find time for.
  const frames = new Map<number, number>()
  for (const e of spans)
    if (e.name === 'FireAnimationFrame' && e.tid !== undefined)
      frames.set(e.tid, (frames.get(e.tid) ?? 0) + 1)
  const main = [...frames].sort((a, b) => b[1] - a[1])[0]?.[0]
  const mine = spans.filter(e => e.tid === main)
  const drawn = mine.filter(e => e.name === 'Commit').length

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
    `panel: ${scene}, ${seconds}s, ${drawn} frames drawn (${(drawn / seconds).toFixed(0)}/s)`,
  )
  console.log(
    `main thread busy ${busy.toFixed(0)}ms — ${(busy / drawn).toFixed(2)}ms of every ${FRAME_MS.toFixed(1)}ms frame, ${((busy / (seconds * 1000)) * 100).toFixed(1)}% of one core`,
  )
  for (const [label, ms] of rows)
    console.log(
      `  ${label.padEnd(22)} ${ms.toFixed(0).padStart(5)}ms  ${(ms / drawn).toFixed(3)}ms/frame`,
    )
}

await main()

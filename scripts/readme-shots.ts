import { DEFAULT_CONTROLS, type Controls } from '../src/controls.ts'
import { boardHash } from '../src/ui/share.ts'
import {
  attach,
  chromePath,
  sleep,
  APP_READY,
  drawingsOn,
  until,
  type Page,
} from './chrome.ts'
import { serveDev } from './serve.ts'

import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The README's picture: `pnpm readme-shots` rewrites docs/readme/*.jpg. Each
// picture is the whole app with one stage open, the part it is about outlined,
// and a zoom of that part laid over the bench. Pass file names to retake only
// those. Wants a Chrome and ImageMagick's `magick`.

const PORT = 5220
const DEBUG_PORT = 9344
const VIEW = { width: 1440, height: 900 }
const DPR = 2
const PAD = 4
const MARGIN = 24
const ACCENT = '#ffb020'
const OUT = 'docs/readme'

interface Shot {
  file: string
  stage?: string
  board?: Partial<Controls>
  press?: string
  zoom: string
  width?: number
}

const drawing = (label: string) => `aside svg[aria-label="${label}"]`

const SHOTS: Shot[] = [
  {
    file: 'plinky-bus.jpg',
    stage: 'Plinky',
    board: { chipDataLine: 4, chipDataFault: 3 },
    press: 'bus',
    zoom: drawing('plinky bus wiring'),
    width: 1800,
  },
]

const ask = async (page: Page, expression: string) => {
  const { result, exceptionDetails } = await page.send<{
    result: { value?: unknown }
    exceptionDetails?: { text: string }
  }>('Runtime.evaluate', { expression, returnByValue: true, userGesture: true })
  if (exceptionDetails)
    throw new Error(`${expression}: ${exceptionDetails.text}`)
  return result.value
}

const rectOf = async (page: Page, selector: string) => {
  const value = await ask(
    page,
    `JSON.stringify(document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect() ?? null)`,
  )
  const rect: unknown = JSON.parse(String(value))
  return rect &&
    typeof rect === 'object' &&
    'x' in rect &&
    'y' in rect &&
    'width' in rect &&
    'height' in rect
    ? {
        x: Number(rect.x),
        y: Number(rect.y),
        width: Number(rect.width),
        height: Number(rect.height),
      }
    : undefined
}

// A real mouse click: the drawings answer pointer input, not a synthetic
// click event.
const mouseAt = async (page: Page, x: number, y: number) => {
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      clickCount: 1,
    })
}

const press = async (page: Page, text: string) => {
  await ask(
    page,
    `(() => {
      const hit = [...document.querySelectorAll('aside *')]
        .find(e => !e.children.length && e.textContent.replace(/^[▸▾]/, '').trim().toLowerCase() === ${JSON.stringify(text)})
      if (hit) hit.setAttribute('data-press', '')
    })()`,
  )
  const rect = await rectOf(page, '[data-press]')
  if (!rect) throw new Error(`no box reading ${text}`)
  await mouseAt(page, rect.x + rect.width / 2, rect.y + rect.height / 2)
}

const dismissStart = (page: Page) =>
  ask(
    page,
    `[...document.querySelectorAll('button')].find(b => b.textContent.includes('look at it in silence'))?.click()`,
  )

async function open(page: Page, shot: Shot) {
  const query = boardHash('', { ...DEFAULT_CONTROLS, ...shot.board })
  await ask(
    page,
    `sessionStorage.setItem('bender.openStage', ${JSON.stringify(shot.stage ?? '')})
    history.replaceState(null, '', location.pathname + ${JSON.stringify(query ? `#${query}` : '')})
    window.stale = true`,
  )
  await page.send('Page.reload')
  await until(page, `!window.stale && ${APP_READY}`)
  await dismissStart(page)
  await sleep(1000)
  if (shot.press) {
    await press(page, shot.press)
    await sleep(800)
  }
  await until(page, `!!document.querySelector(${JSON.stringify(shot.zoom)})`)
  await ask(
    page,
    `document.querySelector(${JSON.stringify(shot.zoom)}).scrollIntoView({ block: 'center' })`,
  )
  await sleep(400)
}

const magick = (args: string[]) => execFileSync('magick', args)

function compose(raw: string, work: string, shot: Shot, rect: Rect) {
  const box = {
    x: Math.round((rect.x - PAD) * DPR),
    y: Math.round((rect.y - PAD) * DPR),
    w: Math.round((rect.width + PAD * 2) * DPR),
    h: Math.round((rect.height + PAD * 2) * DPR),
  }
  const inset = join(work, 'inset.png')
  const fit = `${Math.round(VIEW.width * DPR * 0.5)}x${Math.round(VIEW.height * DPR * 0.5)}`
  magick([
    raw,
    '-crop',
    `${box.w}x${box.h}+${box.x}+${box.y}`,
    '+repage',
    '-resize',
    fit,
    '-bordercolor',
    ACCENT,
    '-border',
    String(3 * DPR),
    inset,
  ])
  const [, insetH = 0] = execFileSync('magick', [
    'identify',
    '-format',
    '%w %h',
    inset,
  ])
    .toString()
    .split(' ')
    .map(Number)
  const at = MARGIN * DPR
  magick([
    raw,
    '-fill',
    'none',
    '-stroke',
    ACCENT,
    '-strokewidth',
    String(2 * DPR),
    '-draw',
    `rectangle ${box.x},${box.y} ${box.x + box.w},${box.y + box.h}`,
    inset,
    '-geometry',
    `+${at}+${VIEW.height * DPR - insetH - at}`,
    '-composite',
    '-resize',
    `${shot.width ?? 1600}x`,
    '-quality',
    '84',
    join(OUT, shot.file),
  ])
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

async function main() {
  const only = process.argv.slice(2)
  const shots = SHOTS.filter(s => !only.length || only.includes(s.file))
  mkdirSync(OUT, { recursive: true })
  const { url, stop } = await serveDev(PORT)
  const work = mkdtempSync(join(tmpdir(), 'bender-readme-'))
  const chrome = spawn(
    chromePath(),
    [
      '--headless',
      '--enable-automation',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${VIEW.width},${VIEW.height}`,
      `--force-device-scale-factor=${DPR}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${join(work, 'profile')}`,
      url,
    ],
    { stdio: 'ignore' },
  )
  try {
    const page = await attach(DEBUG_PORT)
    await page.send('Page.enable')
    await page.send('Emulation.setDeviceMetricsOverride', {
      ...VIEW,
      deviceScaleFactor: DPR,
      mobile: false,
    })
    await until(page, APP_READY)
    await drawingsOn(page)
    for (const shot of shots) {
      await open(page, shot)
      const rect = await rectOf(page, shot.zoom)
      if (!rect) throw new Error(`${shot.file}: nothing at ${shot.zoom}`)
      const png = await page.send<{ data: string }>('Page.captureScreenshot', {
        format: 'png',
      })
      const raw = join(work, 'raw.png')
      writeFileSync(raw, Buffer.from(png.data, 'base64'))
      compose(raw, work, shot, rect)
      console.log(join(OUT, shot.file))
    }
    page.close()
  } finally {
    const gone = new Promise(r => chrome.on('exit', r))
    chrome.kill()
    await gone
    await stop()
    rmSync(work, { recursive: true, force: true })
  }
}

await main()

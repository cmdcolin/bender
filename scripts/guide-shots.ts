import { DEFAULT_CONTROLS, type Controls } from '../src/controls.ts'
import { encodeControls } from '../src/ui/share.ts'
import {
  attach,
  chromePath,
  sleep,
  APP_READY,
  until,
  type Page,
} from './chrome.ts'
import { serveDev } from './serve.ts'

import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The five pictures in docs/USER-GUIDE.md: `pnpm guide-shots` rewrites all of
// public/guide/guide-*.jpg from the app as it is now. Each shot is a board, a thing to click once the page
// is up, and the element (or elements) to crop to — read off the page rather
// than hand-picked pixels, so a layout change breaks the shot instead of
// quietly outdating it.
//
// Same headless-Chrome-over-devtools-protocol approach as
// panel.ts, sharing chrome.ts and serve.ts. Wants a Chrome and ImageMagick's
// `magick`.

const PORT = 5200
const DEBUG_PORT = 9334
const VIEW = { width: 1300, height: 2000 }
const DPR = 2
const PAD = 14

interface Shot {
  file: string
  board?: Partial<Controls>
  act?: (page: Page) => Promise<void>
  select: string[]
  pad?: number
}

const SHOTS: Shot[] = [
  {
    file: 'guide-keyboard.jpg',
    select: ['[aria-label="plinky"]'],
  },
  {
    file: 'guide-drums.jpg',
    select: ['[aria-label="clatter"]'],
  },
  {
    file: 'guide-fm.jpg',
    board: { fmLevel: 0.6, fmVoice: 1 },
    select: ['[aria-label="glint"]'],
  },
  {
    file: 'guide-trigger.jpg',
    board: {
      fmLevel: 0.5,
      trigToKeys: 1,
      trigKeysNote: 1,
      trigToDrum: 1,
      fmStruck: 1,
    },
    act: page => click(page, '[data-door="Trigger patch"]'),
    select: ['aside [class*="section"]'],
    pad: 8,
  },
  {
    file: 'guide-patchbay.jpg',
    board: {
      fmLevel: 0.5,
      combMix: 0.4,
      mod0Src: 1,
      mod0Dest: 27,
      mod1Src: 3,
      mod1Dest: 29,
      mod2Src: 9,
      mod2Dest: 2,
    },
    act: page => click(page, '[data-door="Patch bay"]'),
    select: ['aside [class*="section"]'],
    pad: 8,
  },
]

function which(cmd: string) {
  try {
    return execFileSync('which', [cmd]).toString().trim()
  } catch {
    return ''
  }
}

const ask = async (page: Page, expression: string) => {
  const { result, exceptionDetails } = await page.send<{
    result: { value?: unknown }
    exceptionDetails?: { text: string }
  }>('Runtime.evaluate', { expression, returnByValue: true, userGesture: true })
  if (exceptionDetails)
    throw new Error(`${expression}: ${exceptionDetails.text}`)
  return result.value
}

// cancelable: true — a door is an <a href="#..."> so its own default action
// is a navigation, and the map's click handler only calls preventDefault()
// when the event says that is allowed. Missing this quietly replaces the
// hash the board came in on with a bare anchor, which loses the board.
const click = async (page: Page, selector: string) => {
  await ask(
    page,
    `document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`,
  )
}

const clickText = (page: Page, text: string) =>
  ask(
    page,
    `[...document.querySelectorAll('button')].find(e => (e.textContent ?? '').trim().toLowerCase().includes(${JSON.stringify(text)}))?.click()`,
  )

// A board carrying anything off stock reads to the app as a link somebody
// sent, which puts the 'click to start' dialog up over the whole page, and a
// stock board in a fresh tab puts up the doors. Neither has anything to do
// with these shots, so both come down first, whether or not they are there.
async function dismissStart(page: Page) {
  await clickText(page, 'look at it in silence')
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

async function unionRect(page: Page, selectors: string[]): Promise<Rect> {
  const value = (await ask(
    page,
    `JSON.stringify((() => {
      const sels = ${JSON.stringify(selectors)}
      const els = sels.map(s => document.querySelector(s))
      const missing = sels.filter((s, i) => !els[i])
      if (missing.length) throw new Error('no match for ' + missing.join(', '))
      const rects = els.map(e => e.getBoundingClientRect())
      const x = Math.min(...rects.map(r => r.x))
      const y = Math.min(...rects.map(r => r.y))
      const right = Math.max(...rects.map(r => r.x + r.width))
      const bottom = Math.max(...rects.map(r => r.y + r.height))
      return { x, y, width: right - x, height: bottom - y }
    })())`,
  )) as string
  return JSON.parse(value) as Rect
}

// Retried rather than given a longer fixed sleep: a cold Chrome profile is
// occasionally still short of first paint at 2.5s, and a fixed wait long
// enough to cover that would tax every other run for the rare slow one.
async function settledRect(
  page: Page,
  selectors: string[],
  tries = 20,
): Promise<Rect> {
  for (let i = 0; i < tries; i++) {
    try {
      return await unionRect(page, selectors)
    } catch (e) {
      if (i === tries - 1) throw e
      await sleep(250)
    }
  }
  throw new Error('unreachable')
}

async function shoot(url: string, shot: Shot, into: string) {
  const dir = mkdtempSync(join(tmpdir(), 'bender-guide-'))
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
      `--user-data-dir=${dir}`,
      url,
    ],
    { stdio: 'ignore' },
  )
  try {
    const page = await attach(DEBUG_PORT)
    await page.send('Page.enable')
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: VIEW.width,
      height: VIEW.height,
      deviceScaleFactor: DPR,
      mobile: false,
    })
    await until(page, APP_READY)
    await dismissStart(page)
    await sleep(300)
    if (shot.act) {
      await shot.act(page)
      await sleep(800)
    }

    const rect = await settledRect(page, shot.select)
    const png = await page.send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
    })
    writeFileSync(into, Buffer.from(png.data, 'base64'))
    page.close()
    return rect
  } finally {
    const gone = new Promise(r => chrome.on('exit', r))
    chrome.kill()
    await gone
    rmSync(dir, { recursive: true, force: true })
  }
}

const magick = (args: string[]) => execFileSync('magick', args)

async function main() {
  if (!which('magick')) throw new Error('no imagemagick on PATH')

  const { url, stop } = await serveDev(PORT)
  const work = mkdtempSync(join(tmpdir(), 'bender-guide-out-'))

  try {
    for (const shot of SHOTS) {
      const board: Controls = { ...DEFAULT_CONTROLS, ...shot.board }
      const query = encodeControls(board)
      const full = query ? `${url}#set=${query}` : url
      const raw = join(work, `${shot.file}.png`)
      const rect = await shoot(full, shot, raw)

      const pad = shot.pad ?? PAD
      const box = {
        x: Math.round((rect.x - pad) * DPR),
        y: Math.round((rect.y - pad) * DPR),
        w: Math.round((rect.width + pad * 2) * DPR),
        h: Math.round((rect.height + pad * 2) * DPR),
      }
      const out = join('public/guide', shot.file)
      magick([
        raw,
        '-crop',
        `${box.w}x${box.h}+${box.x}+${box.y}`,
        '+repage',
        '-resize',
        '1100x>',
        '-quality',
        '88',
        out,
      ])
      console.log(out)
    }
  } finally {
    await stop()
    rmSync(work, { recursive: true, force: true })
  }
}

await main()

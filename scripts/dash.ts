import { DEFAULT_CONTROLS } from '../src/controls'
import { applyPreset } from '../src/ui/presets/apply'
import { PRESETS } from '../src/ui/presets/table'
import { boardHash } from '../src/ui/share'
import { SHOT, SHOT_H, SHOT_W } from '../src/ui/whySignIn'
import { attach, chromePath, sleep } from './chrome'
import { serveDev } from './serve'

import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The picture the why-sign-in card shows: the home page as it looks once you
// are signed in, with a few voices on it. `pnpm dash` rewrites
// public/dashboard.jpg from the page as it is now, so the shot cannot drift
// from the layout.
//
// Nobody signs in for it. main.ts hands showHome to the page under the dev
// server, and this calls it with voices made up here, so the shot carries no
// real account and needs no network beyond localhost.
//
// Wants a Chrome and ImageMagick's `magick`.

const OUT = `public/${SHOT}`
const PORT = 5197
const DEBUG_PORT = 9335
const VIEW = { width: 980, height: 1400 }
const DPR = 2

const NOW = Date.UTC(2026, 2, 14, 19, 0, 0)
const HOUR = 3600_000
const DAY = 24 * HOUR

const boardFor = (preset: string) => {
  const found = PRESETS.find(p => p.name === preset)
  if (!found) throw new Error(`no preset '${preset}'`)
  return boardHash('', applyPreset(found, { ...DEFAULT_CONTROLS }))
}

const VOICES = [
  ['sunday drone', 'dawn chorus', 2 * HOUR],
  ['tape eater', 'flat batteries', 20 * HOUR],
  ['angry kettle', 'air raid', 2 * DAY],
  ['bad wiring v2', 'paperclip', 4 * DAY],
  ['slow collapse', 'dying toy', 9 * DAY],
  ['gravel', 'gravel dac', 23 * DAY],
] as const

const DOC = {
  recent: [
    { id: 'shot', query: boardFor('wrong song'), at: NOW - 40 * 60_000 },
  ],
  voices: VOICES.map(([name, preset, ago]) => ({
    name,
    query: boardFor(preset),
    savedAt: NOW - ago,
  })),
}

const USER = { uid: 'shot', name: 'Alex', photo: null }

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

async function shoot(url: string, into: string) {
  const dir = mkdtempSync(join(tmpdir(), 'bender-dash-'))
  const chrome = spawn(
    chromePath(),
    [
      '--headless',
      '--enable-automation',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${VIEW.width},${VIEW.height}`,
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
    await sleep(2500)

    await page.send('Runtime.evaluate', {
      expression: `(() => {
        const show = window.benderShowHome
        if (!show) throw new Error('the page handed over no showHome — dev server?')
        show(${JSON.stringify(USER)}, ${JSON.stringify(DOC)}, ${NOW})
      })()`,
    })
    // Measured after a frame: the home is built and attached in the call above,
    // and nothing has been laid out at the moment it returns.
    await sleep(500)
    const { result } = await page.send<{ result: { value: string } }>(
      'Runtime.evaluate',
      {
        expression: `JSON.stringify((() => {
          const el = document.getElementById('voices')
          if (!el) throw new Error('no voices section on the page')
          const r = el.getBoundingClientRect()
          return { x: r.x, y: r.y, width: r.width, height: r.height }
        })())`,
      },
    )
    const rect = JSON.parse(result.value) as Rect

    // The page from the site bar down to the last voice: the whole of what an
    // account gets you, and nothing of the demos under it, which the landing
    // page already shows to everybody.
    const shot = await page.send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: VIEW.width,
        height: rect.y + rect.height + 24,
        scale: DPR,
      },
    })
    writeFileSync(into, Buffer.from(shot.data, 'base64'))
    page.close()
  } finally {
    const gone = new Promise(r => chrome.on('exit', r))
    chrome.kill()
    await gone
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  const { url, stop } = await serveDev(PORT)
  const home = url.replace(/app\/$/, '')
  const work = mkdtempSync(join(tmpdir(), 'bender-dash-out-'))
  const shot = join(work, 'home.png')
  try {
    await shoot(home, shot)
    execFileSync('magick', [
      shot,
      '-resize',
      `${SHOT_W - 2}x`,
      '-bordercolor',
      '#3a3a40',
      '-border',
      '1',
      '-quality',
      '88',
      OUT,
    ])
    // Both cards size the <img> from SHOT_W and SHOT_H. A shot that came out
    // any other shape would be drawn at the old one.
    const size = execFileSync('magick', ['identify', '-format', '%w %h', OUT])
      .toString()
      .trim()
    if (size !== `${SHOT_W} ${SHOT_H}`)
      throw new Error(
        `the shot came out ${size} — set SHOT_W and SHOT_H in src/ui/whySignIn.ts to match`,
      )
    console.log(`${OUT} — ${size}`)
  } finally {
    await stop()
    rmSync(work, { recursive: true, force: true })
  }
}

await main()

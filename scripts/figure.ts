import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONTROLS, type Controls } from '../src/controls'
import { encodeControls } from '../src/ui/share'
import { attach, chromePath, sleep } from './chrome'

// The README's one picture: the panel drawn big on the left, and the whole app
// small beside it with the panel ringed in red where it actually sits. `pnpm figure`
// rewrites docs/img/panel-callout.jpg from the app as it is now, so the shot
// never drifts from the board — no hand-cropping to redo.
//
// It drives a headless Chrome over the devtools protocol rather than a browser
// library, so the repo owes nothing to a 300 MB dependency for one image, and
// it asks the page where the panel is instead of carrying pixel coordinates
// that a layout change would quietly invalidate. The socket and the lookup for
// the browser are in chrome.ts, shared with panel.ts.
//
// Wants a Chrome and ImageMagick's `magick`.

const OUT = 'docs/img/panel-callout.jpg'
const PORT = 5199
const VIEW = { width: 1180, height: 900 }

// Shot at two device pixels to the css pixel, so the panel blown up to twice
// its size on screen is still made of pixels the browser drew rather than ones
// ImageMagick guessed.
const DPR = 2

const PAD = 24
const GAP = 40
const PANEL_H = 1240
const APP_W = 700
const BG = '#131316'
const RING = '#ff3b30'

// The stock board: every bend, pedal and wire off, so the drawing is the chain
// itself and nothing else. The picture is there to show the shape of the
// signal path, not a patch.
const BOARD: Controls = { ...DEFAULT_CONTROLS }

function which(cmd: string) {
  try {
    return execFileSync('which', [cmd]).toString().trim()
  } catch {
    return ''
  }
}

async function serve() {
  // Asked for a port rather than pinned to one, and the url is read back out of
  // what vite says: something else on the machine holding 5199 is not a reason
  // for the README's picture to be unbuildable.
  const vite = spawn('node_modules/.bin/vite', ['--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const url = await new Promise<string>((resolve, reject) => {
    let out = ''
    const die = setTimeout(() => reject(new Error('vite never started')), 30000)
    vite.stdout.on('data', (d: Buffer) => {
      out += d.toString()
      const hit = out.match(/(http:\/\/localhost:\d+\/\S*)/)?.[1]
      if (hit) {
        clearTimeout(die)
        resolve(hit.replace(/\x1b\[[0-9;]*m/g, ''))
      }
    })
  })
  return { url, stop: () => vite.kill() }
}

async function shoot(url: string, into: string) {
  const dir = mkdtempSync(join(tmpdir(), 'bender-figure-'))
  const chrome = spawn(
    chromePath(),
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${VIEW.width},${VIEW.height}`,
      `--force-device-scale-factor=${DPR}`,
      '--remote-debugging-port=9333',
      `--user-data-dir=${dir}`,
      url,
    ],
    { stdio: 'ignore' },
  )
  try {
    const page = await attach(9333)
    await page.send('Page.enable')
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: VIEW.width,
      height: VIEW.height,
      deviceScaleFactor: DPR,
      mobile: false,
    })
    await sleep(3000)

    const { result } = await page.send<{ result: { value: string } }>(
      'Runtime.evaluate',
      {
        expression: `JSON.stringify((() => {
        const el = document.querySelector('[class*="graph"]')
        if (!el) throw new Error('no panel on the page')
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      })())`,
      },
    )
    const rect = JSON.parse(result.value) as {
      x: number
      y: number
      width: number
      height: number
    }

    const shot = await page.send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
    })
    writeFileSync(into, Buffer.from(shot.data, 'base64'))
    page.close()
    return rect
  } finally {
    // Waited for, not just signalled: Chrome is still writing its profile
    // directory on the way down, and a removal that races it fails on a
    // directory that is not empty yet.
    const gone = new Promise(r => chrome.on('exit', r))
    chrome.kill()
    await gone
    rmSync(dir, { recursive: true, force: true })
  }
}

const magick = (args: string[]) => execFileSync('magick', args)

async function main() {
  if (!which('magick')) throw new Error('no imagemagick on PATH')

  const { url, stop } = await serve()
  const work = mkdtempSync(join(tmpdir(), 'bender-figure-out-'))
  const shot = join(work, 'shot.png')
  const panel = join(work, 'panel.png')
  const app = join(work, 'app.png')

  try {
    const rect = await shoot(`${url}#set=${encodeControls(BOARD)}`, shot)

    // The box, a hair outside the drawing so the ring never lands on a wire.
    // The page answers in css pixels and the shot is in device ones.
    const box = {
      x: Math.round((rect.x - 4) * DPR),
      y: Math.round((rect.y - 4) * DPR),
      w: Math.round((rect.width + 8) * DPR),
      h: Math.round((rect.height + 8) * DPR),
    }
    // The empty half-screen under the keyboard is not worth the pixels; the
    // caption under the panel is, so the crop stops just below it.
    const appH = Math.min(VIEW.height * DPR, box.y + box.h + 60 * DPR)

    magick([
      shot,
      '-crop',
      `${box.w}x${box.h}+${box.x}+${box.y}`,
      '+repage',
      '-resize',
      `x${PANEL_H}`,
      '-bordercolor',
      RING,
      '-border',
      '3',
      panel,
    ])
    magick([
      shot,
      '-crop',
      `${VIEW.width * DPR}x${appH}+0+0`,
      '+repage',
      '-fill',
      'none',
      '-stroke',
      RING,
      '-strokewidth',
      String(3 * DPR),
      '-draw',
      `rectangle ${box.x},${box.y} ${box.x + box.w},${box.y + box.h}`,
      '-resize',
      `${APP_W}x`,
      '-bordercolor',
      '#3a3a40',
      '-border',
      '1',
      app,
    ])

    const size = (f: string) => {
      const [w = 0, h = 0] = execFileSync('magick', [
        'identify',
        '-format',
        '%w %h',
        f,
      ])
        .toString()
        .split(' ')
        .map(Number)
      return { w, h }
    }
    const { w: pw, h: ph } = size(panel)
    const { w: aw, h: ah } = size(app)
    const canvas = { w: PAD * 2 + pw + GAP + aw, h: PAD * 2 + ph }

    magick([
      '-size',
      `${canvas.w}x${canvas.h}`,
      `xc:${BG}`,
      panel,
      '-geometry',
      `+${PAD}+${PAD}`,
      '-composite',
      app,
      '-geometry',
      `+${PAD + pw + GAP}+${Math.round((canvas.h - ah) / 2)}`,
      '-composite',
      '-quality',
      '88',
      OUT,
    ])
    console.log(`${OUT} — ${canvas.w}x${canvas.h}`)
  } finally {
    stop()
    rmSync(work, { recursive: true, force: true })
  }
}

await main()

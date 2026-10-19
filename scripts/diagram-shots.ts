import {
  attach,
  chromePath,
  sleep,
  APP_READY,
  until,
  type Page,
} from './chrome.ts'
import { serveDev } from './serve.ts'

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Every schematic in the panel, one png each, for checking a layout change by
// eye: `pnpm diagram-shots <dir>`. Puts every stage on the board, opens each
// stage with all its folds unfolded, presses each box once, and crops to each
// drawing that shows, named after the stage and the drawing's label. Shares
// chrome.ts and serve.ts with guide-shots.ts.

const PORT = 5201
const DEBUG_PORT = 9335
const VIEW = { width: 1300, height: 2400 }
const DPR = 2
const PAD = 6

const out = process.argv[2] ?? 'diagram-shots'

const ask = async (page: Page, expression: string) => {
  const { result, exceptionDetails } = await page.send<{
    result: { value?: unknown }
    exceptionDetails?: { text: string }
  }>('Runtime.evaluate', { expression, returnByValue: true, userGesture: true })
  if (exceptionDetails)
    throw new Error(`${expression}: ${exceptionDetails.text}`)
  return result.value
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

interface Found {
  label: string
  x: number
  y: number
  width: number
  height: number
}

async function main() {
  mkdirSync(out, { recursive: true })
  const { url, stop } = await serveDev(PORT)
  const dir = mkdtempSync(join(tmpdir(), 'bender-diagrams-'))
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
      ...VIEW,
      deviceScaleFactor: DPR,
      mobile: false,
    })
    await until(page, APP_READY)
    await ask(
      page,
      `[...document.querySelectorAll('button')].find(e => (e.textContent ?? '').trim().toLowerCase().includes('look at it in silence'))?.click()`,
    )
    await sleep(300)
    await ask(
      page,
      `[...document.querySelectorAll('button')].find(e => e.textContent?.trim() === '+ add a stage')?.click()`,
    )
    for (let i = 0; i < 60; i++) {
      const left = await ask(
        page,
        `(() => { const m = document.querySelector('[role="menuitem"]'); m?.click(); return !!m })()`,
      )
      if (!left) break
      await sleep(150)
    }
    const doors = (await ask(
      page,
      `[...new Set([...document.querySelectorAll('[data-door]')].map(e => e.getAttribute('data-door')))]`,
    )) as string[]
    const seen = new Set<string>()
    const collect = async (door: string) => {
      const n = (await ask(
        page,
        `document.querySelectorAll('aside svg[role="img"]').length`,
      )) as number
      for (let i = 0; i < n; i++) {
        const f = JSON.parse(
          (await ask(
            page,
            `(() => {
              const e = document.querySelectorAll('aside svg[role="img"]')[${i}]
              e.scrollIntoView({ block: 'center' })
              const r = e.getBoundingClientRect()
              return JSON.stringify({ label: e.getAttribute('aria-label') ?? '', x: r.x, y: r.y + scrollY, width: r.width, height: r.height })
            })()`,
          )) as string,
        ) as Found
        const name = `${slug(door)}--${slug(f.label)}`
        if (seen.has(name) || f.width < 40) continue
        seen.add(name)
        await sleep(200)
        const png = await page.send<{ data: string }>(
          'Page.captureScreenshot',
          {
            format: 'png',
            captureBeyondViewport: true,
            clip: {
              x: f.x - PAD,
              y: f.y - PAD,
              width: f.width + PAD * 2,
              height: f.height + PAD * 2,
              scale: 1,
            },
          },
        )
        writeFileSync(join(out, `${name}.png`), Buffer.from(png.data, 'base64'))
        console.log(name)
      }
    }
    for (const door of doors) {
      await ask(
        page,
        `document.querySelector('[data-door=${JSON.stringify(door)}]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`,
      )
      await sleep(800)
      await ask(
        page,
        `document.querySelectorAll('aside details').forEach(d => (d.open = true))`,
      )
      await sleep(600)
      await collect(door)
      const boxes = (await ask(
        page,
        `document.querySelectorAll('aside svg g[role="button"]').length`,
      )) as number
      for (let i = 0; i < boxes; i++) {
        const press = `document.querySelectorAll('aside svg g[role="button"]')[${i}]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`
        await ask(page, press)
        await sleep(300)
        await collect(door)
        await ask(page, press)
      }
    }
    page.close()
  } finally {
    const gone = new Promise(r => chrome.on('exit', r))
    chrome.kill()
    await gone
    rmSync(dir, { recursive: true, force: true })
    await stop()
  }
}

await main()

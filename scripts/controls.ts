import { attach, chromePath, sleep } from './chrome.ts'
import { serveDev } from './serve.ts'

import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Every button and select on the panel, grouped by rendered height, with every
// stage opened in turn. The kinds in button.module.css belong at --ctl-h-sm or
// --ctl-h; anything else in the list is either an instrument (keys, pads, grid
// cells) or a control that skips the kinds.
//
//   pnpm controls           a mouse
//   pnpm controls --touch   a finger, where both heights are 32px

const PORT = 5211
const DEBUG_PORT = 9341
const touch = process.argv.includes('--touch')

type Seen = Record<string, Record<string, string>>

const COLLECT = `(() => {
  const seen = {}
  for (const el of document.querySelectorAll('button, select')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const kind = [...el.classList]
      .map(c => c.replace(/^_([A-Za-z]\\w*?)_\\w+$/, '$1'))
      .join(' ') || el.tagName.toLowerCase()
    const h = Math.round(r.height * 10) / 10
    seen[h] ??= {}
    seen[h][kind] ??= (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)
  }
  return JSON.stringify(seen)
})()`

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'bender-controls-chrome-'))
  const { url, stop } = await serveDev(PORT)
  const chrome = spawn(
    chromePath(),
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--window-size=1600,1000',
      url,
    ],
    { stdio: 'ignore' },
  )
  const all: Seen = {}
  try {
    const page = await attach(DEBUG_PORT)
    const ask = async (expression: string) =>
      (
        await page.send<{ result: { value?: unknown } }>('Runtime.evaluate', {
          expression,
          userGesture: true,
        })
      ).result.value
    const collect = async () => {
      const got: Seen = JSON.parse(String(await ask(COLLECT)))
      for (const [h, kinds] of Object.entries(got))
        all[h] = { ...kinds, ...all[h] }
    }
    const each = async (selector: string, press: string, wait: number) => {
      const n = Number(
        await ask(`document.querySelectorAll('${selector}').length`),
      )
      for (let i = 0; i < n; i++) {
        await ask(
          `(() => { const el = document.querySelectorAll('${selector}')[${i}]; ${press} })()`,
        )
        await sleep(wait)
        await collect()
      }
    }

    if (touch) {
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true })
      await page.send('Page.reload')
    }
    await sleep(3000)
    await ask(`document.querySelector('[class*=start]')?.click()`)
    await sleep(500)
    await collect()
    await each(
      'button[aria-expanded]',
      `if (el?.getAttribute('aria-expanded') === 'false') el.click()`,
      120,
    )
    await each(
      '[data-door]',
      `el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
      400,
    )
    page.close()
  } finally {
    chrome.kill()
    await stop()
  }

  for (const h of Object.keys(all).sort((a, b) => Number(a) - Number(b))) {
    console.log(`${h}px`)
    for (const [kind, text] of Object.entries(all[h]!))
      console.log(`  ${kind.padEnd(36)} ${text}`)
  }
}

main().then(
  () => process.exit(0),
  e => {
    console.error(e)
    process.exit(1)
  },
)

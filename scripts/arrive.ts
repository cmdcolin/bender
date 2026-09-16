import { attach, chromePath, sleep, type Page } from './chrome'
import { buildAndPreview } from './serve'

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// What a board arriving from outside actually does, in a real browser against a
// built app: the url reaches the controls, the overlay says where to press, and
// pressing it plays. Every step of that sits between modules — the hash, the
// engine, the tab's own shelf, React — so nothing in vitest covers the whole of
// it, and both ways it has broken so far were in the joins.
//
// Usage: pnpm arrive

const PORT = 5241
const DEBUG_PORT = 9441

async function ev(page: Page, expression: string, userGesture = false) {
  const r = await page.send<{
    result: { value?: unknown }
    exceptionDetails?: { exception?: { description?: string }; text: string }
  }>('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture,
  })
  if (r.exceptionDetails)
    throw new Error(
      `${expression}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`,
    )
  return String(r.result.value)
}

async function ready(page: Page) {
  for (let i = 0; i < 200; i++) {
    if ((await ev(page, 'typeof window.bender === "object"')) === 'true') return
    await sleep(200)
  }
  throw new Error('window.bender never appeared')
}

const served = await buildAndPreview(PORT, { minify: false })
const profile = mkdtempSync(join(tmpdir(), 'bender-arrive-'))
const chrome = spawn(
  chromePath(),
  [
    '--headless=new',
    '--enable-automation',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
const page = await attach(DEBUG_PORT)

const open = async (url: string) => {
  await page.send('Page.navigate', { url: 'about:blank' })
  await sleep(250)
  await page.send('Page.navigate', { url })
  await ready(page)
  await sleep(700)
}
const overlay = () =>
  ev(page, `!!document.querySelector('dialog[aria-label="start the board"]')`)
const board = async () =>
  JSON.parse(await ev(page, 'JSON.stringify(window.bender.board())'))
const state = async () =>
  JSON.parse(await ev(page, 'JSON.stringify(window.bender.summary())'))
const press = () =>
  ev(
    page,
    `document.querySelector('dialog[aria-label="start the board"] button').click()`,
    true,
  )

let failures = 0
const check = (label: string, ok: boolean, saw: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) {
    failures++
    console.log('     saw', JSON.stringify(saw))
  }
}

try {
  await open(served.url)
  await ev(page, `window.bender.tune('C4 E4 G4 C5 . ~ D4 F4')`)
  await ev(page, `window.bender.drums({ Kick: 'x..x..x.' })`)
  await sleep(700)
  const link = await ev(page, 'window.location.href')
  console.log('link:', link, '\n')

  for (const [label, url] of [
    ['as sent', link],
    ['with a full stop stuck to it', `${link}.`],
    ['wrapped in markdown parens', `${link})`],
    ['the next word autolinked with it', `${link}%20and%20the%20kit`],
  ] as const) {
    await ev(page, 'sessionStorage.clear()')
    await open(url)
    const b = await board()
    check(
      `${label}: the melody arrives`,
      b.tune[0].startsWith('C4 E4 G4 C5'),
      b.tune[0],
    )
    check(`${label}: the chip is on yours`, b.song === 'yours', b.song)
    check(
      `${label}: the overlay says where to press`,
      (await overlay()) === 'true',
      null,
    )
    await press()
    await sleep(700)
    const s = await state()
    check(
      `${label}: start starts the board`,
      s.song.includes('yours') && s.drums.includes('playing'),
      s,
    )
  }

  console.log('\n--- a tab that has been here ---')
  await ev(page, 'sessionStorage.clear()')
  await open(served.url)
  await ev(page, `window.bender.play('song')`)
  await sleep(400)
  await page.send('Page.navigate', { url: link })
  await ready(page)
  await sleep(700)
  check(
    'a link pasted into a working tab gets no overlay',
    (await overlay()) === 'false',
    null,
  )
  check(
    'and the board still arrives',
    (await board()).song === 'yours',
    await board(),
  )

  console.log('\n--- your own reload ---')
  await ev(page, 'sessionStorage.clear()')
  await open(served.url)
  await ev(page, `window.bender.set({ dlyFb: 0.6 })`)
  await sleep(700)
  const mine = await ev(page, 'window.location.href')
  await page.send('Page.reload')
  await ready(page)
  await sleep(700)
  check(
    'reloading your own board is not somebody sending you one',
    (await overlay()) === 'false',
    mine,
  )
  check(
    'and the board comes back',
    (await board()).controls.length > 0,
    await board(),
  )
} finally {
  page.close()
  chrome.kill()
  await served.stop()
  // Chrome is still emptying the profile as it goes, so a directory that will
  // not come away is the browser leaving rather than anything to report.
  await sleep(500)
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
}

if (failures > 0) {
  console.log(`\n${failures} failed`)
  process.exitCode = 1
} else console.log('\nall good')

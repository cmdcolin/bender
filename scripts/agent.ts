import { attach, chromePath, type Page } from './chrome.ts'
import { serveDev } from './serve.ts'

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Drives window.bender in headless Chrome the way a browsing agent does, and
// exits non-zero when a check fails. Usage: node scripts/agent.ts

const PORT = 5211
const DEBUG_PORT = 9411

async function evaluate(page: Page, expression: string, userGesture = false) {
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
  return r.result.value
}

let failures = 0
function check(label: string, ok: boolean, value: unknown) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) {
    failures++
    console.log(JSON.stringify(value, null, 2))
  }
}

interface Heard {
  peak?: string
  reboots?: number
  sources?: string[]
  drumHits?: string[]
  notes?: Record<string, string[]>
}

interface Position {
  bar: number
  step: number
}

interface Clock {
  before: Position
  next: Position
  queued: Position & { landed: string }
  snare?: string
}

const served = await serveDev(PORT)
const profile = mkdtempSync(join(tmpdir(), 'bender-agent-'))
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

try {
  await page.send('Page.navigate', { url: served.url })
  let ready = false
  for (let i = 0; i < 150 && !ready; i++) {
    ready = (await evaluate(page, 'typeof window.bender === "object"')) === true
    if (!ready) await new Promise(r => setTimeout(r, 200))
  }
  check('the page publishes window.bender', ready, ready)

  const meta = await evaluate(
    page,
    'document.querySelector("meta[name=ai-instructions]")?.content',
  )
  check(
    'the meta tag names bender.help',
    String(meta).includes('bender.help'),
    meta,
  )

  const cold = await evaluate(page, 'bender.start()')
  check(
    'start without a gesture reports suspended',
    String(cold).startsWith('suspended'),
    cold,
  )
  const warm = await evaluate(page, 'bender.start()', true)
  check('start with a gesture reports running', warm === 'running', warm)

  await evaluate(
    page,
    `bender.tune(['C4 E4 G4 C5 G4 E4 C4 ~', 'C3 ~ G2 ~ C3 ~ G2 ~']),
     bender.drums({ kick: 'x...x...x...x...', hat: '..x...x...x...x.' }),
     bender.play()`,
  )
  const clean = (await evaluate(page, 'bender.listen(2500)')) as Heard
  check(
    'listen hears the toy and the kit',
    clean.peak !== 'silent' &&
      Boolean(clean.sources?.includes('Plinky')) &&
      Boolean(clean.sources?.includes('Clatter')) &&
      Boolean(clean.drumHits?.includes('kick')) &&
      Boolean(clean.notes?.Plinky?.includes('E4')),
    clean,
  )

  const clock = (await evaluate(
    page,
    `(async () => {
      const before = bender.position()
      const next = await bender.next('bar')
      const queued = await bender.queue(() =>
        bender.drums({ snare: '....x.......x...' }),
      )
      return { before, next, queued, snare: bender.board().drums.snare }
    })()`,
  )) as Clock
  check(
    'next resolves on the downbeat after the bar position reports',
    clock.next.bar === clock.before.bar + 1 && clock.next.step <= 1,
    clock,
  )
  check(
    'queue lands its writes on the bar after that',
    clock.queued.landed === `on bar ${clock.next.bar + 1}` &&
      clock.queued.step <= 1 &&
      clock.snare === '....x.......x...',
    clock,
  )

  // At 6 Hz the stacked lane strikes every 0.33 s, and a struck voice falls
  // below the envelope floor 1.21 s later. Parlor, up on the bench from the
  // start, lets go on stop and takes its release to fall the rest of the way.
  await evaluate(page, 'bender.set({ tuneRate: 6 }), bender.listen(1000)')
  await evaluate(page, 'bender.stop()')
  await evaluate(page, 'bender.listen(1500)')
  const after = (await evaluate(page, 'bender.listen(1000)')) as Heard
  check(
    'the chord lane goes quiet within 1.5 s of stop at the new tune rate',
    after.notes?.Plinky === undefined &&
      (after.peak === 'silent' || Number.parseFloat(after.peak ?? '0') < -40),
    after,
  )

  const struck = (await evaluate(
    page,
    `(async () => {
      bender.set({ sheetLevel: 0.8 })
      const heard = bender.listen(800)
      bender.hit('sheet', { x: 0.3, y: 0.2 })
      return heard
    })()`,
  )) as Heard
  check(
    'hit rings the sheet',
    Boolean(struck.sources?.includes('Sheet')),
    struck,
  )

  await evaluate(page, 'bender.play()')
  const report = await evaluate(
    page,
    'bender.set({ chipStarve: 1, chipBattery: 1, chipStarv: 1 })',
  )
  check(
    'set reports the typo with the closest key',
    JSON.stringify(report).includes('closest keys: chipStarve'),
    report,
  )
  const starved = (await evaluate(page, 'bender.listen(4000)')) as Heard
  check('a starved rail reboots the chip', (starved.reboots ?? 0) > 0, starved)
} finally {
  page.close()
  chrome.kill()
  await served.stop()
  rmSync(profile, { recursive: true, force: true })
}

process.exit(failures > 0 ? 1 : 0)

import { attach, chromePath, type Page } from './chrome'
import { serveDev } from './serve'

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Drives window.bender in headless Chrome the way a browsing agent does, and
// exits non-zero when a check fails. Usage: pnpm exec tsx scripts/agent.ts

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
  toyNotes?: string[]
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
      Boolean(clean.sources?.includes('toy')) &&
      Boolean(clean.sources?.includes('drums')) &&
      Boolean(clean.drumHits?.includes('kick')) &&
      Boolean(clean.toyNotes?.includes('E4')),
    clean,
  )

  // At 6 Hz the stacked lane strikes every 0.33 s, and a struck voice falls
  // below the envelope floor 1.21 s later.
  await evaluate(page, 'bender.set({ tuneRate: 6 }), bender.listen(1000)')
  await evaluate(page, 'bender.stop()')
  await evaluate(page, 'bender.listen(1500)')
  const after = (await evaluate(page, 'bender.listen(1000)')) as Heard
  check(
    'the chord lane goes quiet within 1.5 s of stop at the new tune rate',
    after.peak === 'silent' && after.toyNotes?.length === 0,
    after,
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

// Walks the whole panel and asks three things a screenshot cannot: is any text
// drawn on top of any other text, is there a control with nothing an assistive
// technology could announce, and is any text set too faint to read against what
// it is painted on.
//
//   pnpm ink            every stage, at all three shells
//   pnpm ink 470        one shell, by its panel width
//
// The other browser scripts here measure: figure.ts takes a picture and
// panel.ts times a frame. Both are blind to this class of fault, because the
// fault is never in the state they capture — it is in the stage nobody had
// open, on the one label long enough to need the whole row. The panel draws
// eleven stages and a few hundred control rows, and nobody opens all of them
// to look.
//
// It serves the working tree, so it reads whatever is on disk right now — which
// is the point when you are checking a fix, and a trap when something else is
// editing. A half-written import fails the whole run, and an HMR reload
// mid-walk remounts the panel so every later stage is read off a different app.
// `INK_ROOT=/path/to/a/copy pnpm ink` serves somewhere else, for exactly that.
//
// Three shells, because the fault is always a width. The docked panel is 470px
// and holds that from 761px of viewport up. Below 760 the app stacks and the
// panel takes the whole screen, which on a phone in portrait is 390 — the
// narrowest the panel ever is. Landscape keeps the 470 and takes the height
// away instead, which is what catches anything that only fits by scrolling.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attach, chromePath, sleep, type Page } from './chrome'

const PORT = 5197
const DEBUG_PORT = 9336

const SHELLS = [
  { name: 'docked', panel: 470, width: 1352, height: 950 },
  { name: 'landscape', panel: 470, width: 844, height: 390 },
  { name: 'portrait', panel: 390, width: 390, height: 844 },
]

const only = process.argv[2]
const shells =
  only === undefined ? SHELLS : SHELLS.filter(s => String(s.panel) === only)
if (shells.length === 0)
  throw new Error(`no shell with a ${only}px panel — 470 or 390`)

// One finding is one fault, however many stages it shows up on: the same rule
// paints the same word on all 34 of them, and a report that says so 34 times is
// one nobody reads to the end.
// The dim things that are meant to be dim. --fg4 is 2.6:1 on this panel and no
// lift clears 4.5 without merging into --fg3, so the tier stays where it is and
// the rule is what it carries: a word on a button reads at --fg3, and --fg4 is
// for a mark whose message is that it is quiet. These are the second kind, and
// WCAG exempts none of them — they are a decision, listed so a new one is not.
const ACCEPTED: Record<string, string> = {
  'span.num': 'the position of a slot in the chain, read off the row beside it',
  'span.padKey': 'the key that fires a pad, under the pad it fires',
  'span.loopLabel': 'the keybed loop marker, beside the keys it is about',
  'span.name': "an octave mark on the keybed and a pad's own name",
  'span.end':
    'the far end of a travel the knob is not in — the lit end is the reading, ' +
    'and this one being dim is how you tell which half you are in',
  'span.tag': 'why a row you can see is a row you cannot hear',
  'span.shelfLabel': 'the name of the shelf, not of anything on it',
  'span.rigsLabel': 'the word in front of the settings chips',
}

// Every finding opens with the class it is about, which is what the list above
// is keyed on.
const classOf = (line: string) => line.slice(0, line.indexOf('  '))

const fails = new Map<string, { seen: number; first: string }>()
const allowed = new Map<string, number>()

const note = (kind: string, line: string, where: string) => {
  const at = classOf(line)
  if (kind === 'too faint' && at in ACCEPTED) {
    const seen = allowed.get(at)
    allowed.set(at, seen === undefined ? 1 : seen + 1)
  } else {
    const key = `${kind}  ${line}`
    const had = fails.get(key)
    if (had) had.seen++
    else fails.set(key, { seen: 1, first: where })
  }
}

function serve() {
  const vite = spawn(
    `${process.cwd()}/node_modules/.bin/vite`,
    ['--port', String(PORT)],
    { stdio: ['ignore', 'pipe', 'inherit'], cwd: process.env.INK_ROOT },
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
    awaitPromise: true,
    userGesture: true,
  })
  if (exceptionDetails)
    throw new Error(`${expression.slice(0, 60)}: ${exceptionDetails.text}`)
  return result.value
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []

// Every leaf carrying text, checked pairwise for a box that intersects
// another's, plus every control with no name. Leaves only, so a container and
// the thing inside it is not a hit. SVG is skipped — the map's boxes overlap
// their own labels by design. So is anything positioned or in a popover, since
// floating over the row below is what a tip is for.
const SCAN = `(() => {
  const panel = document.querySelector('aside[aria-label="the board"]')
  if (panel === null) return { over: [], unnamed: [], faint: [] }
  // Vite scopes a CSS-module class as _<local>_<hash>, so the hash comes off
  // and the name the stylesheet calls it by is what gets reported.
  const name = e =>
    e.tagName.toLowerCase() + '.' +
    (e.className ?? '').toString().trim().split(/\\s+/)
      .map(c => c.replace(/^_/, '').replace(/_[A-Za-z0-9_-]{4,}$/, ''))
      .filter(c => c !== '').join('.')
  const leaves = []
  for (const e of panel.querySelectorAll('*')) {
    if (e.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue
    if (e.children.length > 0) continue
    const t = (e.textContent ?? '').replace(/\\s+/g, ' ').trim()
    if (t === '') continue
    const s = getComputedStyle(e)
    if (s.position === 'absolute' || s.position === 'fixed') continue
    if (s.visibility === 'hidden' || s.opacity === '0') continue
    if (e.closest('[popover]') !== null) continue
    const r = e.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    leaves.push({ e, r, t })
  }
  const over = []
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const A = leaves[i], B = leaves[j]
      if (A.e.contains(B.e) || B.e.contains(A.e)) continue
      // A pixel and a half of slack: an inline box sits a hair proud of its own
      // glyphs, and two rows a step apart in a column touch at the edge.
      const x = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left)
      const y = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top)
      if (x > 1.5 && y > 1.5)
        over.push(
          Math.round(x) + 'x' + Math.round(y) + 'px  "' + A.t.slice(0, 44) +
          '" over "' + B.t.slice(0, 44) + '"  (' + name(A.e) + ' / ' + name(B.e) + ')')
    }
  }
  // A placeholder is deliberately not accepted: it is the weakest fallback an
  // assistive technology has and it is gone as soon as the field has content.
  const named = e => {
    const al = e.getAttribute('aria-label')
    if (al !== null && al.trim() !== '') return true
    const by = e.getAttribute('aria-labelledby')
    if (by !== null && document.getElementById(by.split(/\\s+/)[0]) !== null) return true
    if ((e.textContent ?? '').trim() !== '') return true
    if (typeof e.title === 'string' && e.title.trim() !== '') return true
    if (e.id !== '' && document.querySelector('label[for="' + CSS.escape(e.id) + '"]') !== null)
      return true
    return e.closest('label') !== null
  }
  const unnamed = []
  for (const e of panel.querySelectorAll(
    'button, input, select, textarea, [role=radio], [role=button], [role=slider]')) {
    const r = e.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (named(e)) continue
    // The class name is a CSS-module hash and often empty, so say where it is:
    // whatever heading it stands under, and whatever it does say to a sighted
    // reader. "nothing announces input." is a true report nobody can act on.
    const head = e.closest('div')?.closest('div')?.querySelector('h2, h3, summary')
    const where = head == null ? ''
      : ' under "' + head.textContent.replace(/\\s+/g, ' ').trim().slice(0, 30) + '"'
    const says = typeof e.placeholder === 'string' && e.placeholder !== ''
      ? ' placeholder "' + e.placeholder + '"' : ''
    unnamed.push(name(e) + says + where)
  }
  // And the third: what each piece of text is worth against the first opaque
  // thing painted under it. The panel has four text tiers and the fourth is
  // 2.6:1 here — which is right for something whose message is that it is dim,
  // and wrong for a sentence. This is the check that tells the two apart.
  const px = c => {
    const m = c.match(/[\\d.]+/g)?.map(Number) ?? []
    return m.length < 3 ? null : { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }
  }
  const over1 = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  })
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b)
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }
  // The ground: every background painted between this element and the root,
  // composited back to front, so a tint over a panel over the page reads as the
  // one colour a glyph actually sits on.
  const ground = e => {
    const stack = []
    for (let n = e; n !== null; n = n.parentElement) {
      const bg = px(getComputedStyle(n).backgroundColor)
      if (bg !== null && bg.a > 0) { stack.push(bg); if (bg.a === 1) break }
    }
    let out = { r: 255, g: 255, b: 255, a: 1 }
    for (const c of stack.reverse()) out = over1(c, out)
    return out
  }
  const faint = []
  for (const { e, r, t } of leaves) {
    const s = getComputedStyle(e)
    const fg = px(s.color)
    if (fg === null) continue
    // A control the browser has switched off: dimness is the message, and WCAG
    // exempts it for exactly that reason.
    if (e.closest(':disabled') !== null) continue
    const bg = ground(e)
    const got = ratio(over1(fg, bg), bg)
    const size = parseFloat(s.fontSize)
    const big = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700)
    const want = big ? 3 : 4.5
    if (got + 0.005 < want)
      faint.push(
        name(e) + '  ' + got.toFixed(2) + ':1 (wants ' + want + ') ' +
        Math.round(size) + 'px on rgb(' +
        [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')  "' + t.slice(0, 44) + '"')
  }
  return {
    over: [...new Set(over)],
    unnamed: [...new Set(unnamed)],
    faint: [...new Set(faint)],
    leaves: leaves.length,
    controls: panel.querySelectorAll('button, input, select, textarea').length,
  }
})()`

const seen = { leaves: 0, controls: 0 }

async function scan(page: Page, where: string) {
  const got = await ask(page, SCAN)
  const { over, unnamed, faint, leaves, controls } = (got ?? {}) as {
    over?: unknown
    unnamed?: unknown
    faint?: unknown
    leaves?: unknown
    controls?: unknown
  }
  if (typeof leaves === 'number') seen.leaves += leaves
  if (typeof controls === 'number') seen.controls += controls
  for (const line of strings(over)) note('ink on ink', line, where)
  for (const line of strings(unnamed)) note('nothing announces', line, where)
  for (const line of strings(faint)) note('too faint', line, where)
}

// Every <details> the stage brought with it, so a fold's rows are measured too
// — a heading is exactly the kind of thing that is only too long once open.
const OPEN_FOLDS = `(() => {
  const panel = document.querySelector('aside[aria-label="the board"]')
  let n = 0
  for (const d of panel?.querySelectorAll('details') ?? [])
    if (!d.open) { d.open = true; n++ }
  return n
})()`

async function walk(page: Page, shell: string) {
  const doors = strings(
    await ask(
      page,
      `[...document.querySelectorAll('[data-door]')].map(e => e.getAttribute('data-door'))`,
    ),
  )
  if (doors.length === 0) throw new Error(`${shell}: no doors on the map`)
  await scan(page, `${shell}/closed`)
  for (const door of doors) {
    await ask(
      page,
      `document.querySelector('[data-door=${JSON.stringify(door)}]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
    )
    await sleep(220)
    await ask(page, OPEN_FOLDS)
    await sleep(120)
    await scan(page, `${shell}/${door}`)
  }
  console.log(`  ${doors.length} stages walked`)
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'bender-ink-'))
  const { url, stop } = await serve()
  const chrome = spawn(
    chromePath(),
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1400,1000',
      url,
    ],
    { stdio: 'ignore' },
  )
  try {
    const page = await attach(DEBUG_PORT)
    await page.send('Runtime.enable')
    await sleep(2500)
    // In silence: nothing here needs the board running, and an AudioContext is
    // one more thing that can fail on a machine with no output device.
    await ask(
      page,
      `[...document.querySelectorAll('button')].find(e => (e.textContent ?? '').includes('look at it in silence'))?.click()`,
    )
    await sleep(600)
    for (const shell of shells) {
      console.log(`${shell.name} — ${shell.width}x${shell.height}`)
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: shell.width,
        height: shell.height,
        deviceScaleFactor: 1,
        mobile: false,
      })
      // Long enough for the panel to have finished arriving. Measured sooner,
      // the first scan of a shell catches a stage mid-mount and reports a
      // handful of overlaps that are gone by the next frame.
      await sleep(1200)
      const got = await ask(
        page,
        `Math.round(document.querySelector('aside[aria-label="the board"]').getBoundingClientRect().width)`,
      )
      if (got !== shell.panel)
        note(
          'wrong width',
          `the panel came out ${String(got)}px, not ${shell.panel}`,
          shell.name,
        )
      await walk(page, shell.name)
    }
    page.close()
  } finally {
    const gone = new Promise(r => chrome.on('exit', r))
    chrome.kill()
    await gone
    stop()
    rmSync(profile, { recursive: true, force: true })
  }

  const looked = `${seen.leaves} pieces of text and ${seen.controls} controls`
  for (const [at, n] of allowed)
    console.log(`  accepted  ${at} \u00d7${n} \u2014 ${String(ACCEPTED[at])}`)
  if (fails.size === 0) {
    console.log(`\nclean — ${looked}`)
    return
  }
  console.log(`\n${fails.size} findings, over ${looked}\n`)
  for (const [key, { seen: n, first }] of fails)
    console.log(`${key}\n    ${n === 1 ? first : `${first} and ${n - 1} more`}`)
  process.exitCode = 1
}

await main()

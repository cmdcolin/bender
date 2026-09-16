import { build } from 'astro'

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

// Runs real `claude -p --chrome` sessions against bender in the Chrome that
// has the Claude extension signed in, one per task, and grades the board each
// session leaves through a bridge script injected into the served page.
//
// Needs Chrome running on a display with the extension signed in to the same
// account as `claude`. Modeled on jbrowse-components'
// scripts/agent-evals/webAgentEval.ts.
//
// Usage: pnpm agent:eval [--model sonnet] [--filter name] [--device id] [--out dir]

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : (args[i + 1] ?? fallback)
}
const model = flag('model', 'sonnet')
const filter = flag('filter', '')
const outDir = path.resolve(
  flag('out', path.join(os.tmpdir(), `bender-agent-eval-${Date.now()}`)),
)
let deviceId = flag('device', '')

const BASE = '/bender'

interface Task {
  name: string
  prompt: string
  // An async function body with `bender` and `answer` in scope, returning
  // { pass, detail }.
  grade: string
}

const TASKS: Task[] = [
  {
    name: 'preset-reboots',
    prompt:
      'Load the dying toy preset, play the song, and tell me how many times the chip reboots in 3 seconds.',
    grade: `const s = bender.summary()
      return {
        pass: s.preset === 'dying toy' && s.song.startsWith('playing') && s.audio === 'running' && /\\d/.test(answer),
        detail: { preset: s.preset, song: s.song, audio: s.audio, answer },
      }`,
  },
  {
    name: 'arpeggio-kick',
    prompt:
      'Write a C major arpeggio into the melody memory, put a kick drum on every beat, and play both.',
    grade: `const b = bender.board()
      const s = bender.summary()
      const notes = b.tune[0].split(' ').filter(t => /^[A-G]/.test(t))
      const classes = new Set(notes.map(n => n.replace(/-?\\d+$/, '')))
      const kick = b.drums.kick ?? ''
      const beats = kick.length > 0 && [...kick].every((c, i) => (i % 4 === 0) === (c === 'x'))
      return {
        pass: b.song === 'yours' && classes.size >= 3 && [...classes].every(c => ['C', 'E', 'G'].includes(c)) && beats && s.song.startsWith('playing') && s.drums.startsWith('playing'),
        detail: { tune: b.tune, kick, song: s.song, drums: s.drums },
      }`,
  },
  {
    name: 'delay-runaway',
    prompt:
      'Make the tape delay feed back past 1.0 over about 3 seconds so the repeats build up, and make sure the repeats are audible.',
    grade: `const c = bender.board().controls
      const value = key => Number((c.find(r => r.startsWith(key + ' = ')) ?? '').split(' = ')[1]?.split(' ')[0] ?? NaN)
      const fb = value('dlyFb')
      const mix = value('dlyMix')
      return { pass: fb > 1 && mix > 0, detail: { dlyFb: fb, dlyMix: mix } }`,
  },
  {
    name: 'swing',
    prompt: 'Give the drum machine a shuffle of about 40 percent swing.',
    grade: `const c = bender.board().controls
      const row = c.find(r => r.startsWith('drumSwing = ')) ?? ''
      const swing = Number(row.split(' = ')[1]?.split(' ')[0] ?? NaN)
      return { pass: swing >= 0.3 && swing <= 0.5, detail: { row } }`,
  },
]

const BRIDGE_JS = `
(() => {
  const token = crypto.randomUUID()
  const AsyncFunction = (async () => {}).constructor
  async function poll() {
    let job
    try {
      const q = new URLSearchParams({ token, href: location.href })
      const r = await fetch('/__eval/next?' + q, { cache: 'no-store' })
      job = r.status === 200 ? await r.json() : undefined
    } catch {}
    if (job) {
      let body
      try {
        const fn = new AsyncFunction('bender', 'answer', job.code)
        const value = await fn(window.bender, job.answer ?? '')
        body = { id: job.id, value: value === undefined ? null : value }
      } catch (e) {
        body = { id: job.id, error: String((e && e.stack) || e) }
      }
      try {
        await fetch('/__eval/result', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch {}
    }
    setTimeout(poll, 250)
  }
  poll()
})()
`

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
}

interface Job {
  id: number
  token: string
  code: string
  answer: string
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

interface Page {
  token: string
  href: string
  loadedAt: number
  lastPoll: number
}

function serve(root: string) {
  const queue: Job[] = []
  const inFlight = new Map<number, Job>()
  const pages = new Map<string, Page>()
  let nextId = 0

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/__eval/bridge.js') {
      res.setHeader('content-type', 'text/javascript')
      res.end(BRIDGE_JS)
      return
    }
    if (url.pathname === '/__eval/next') {
      const token = url.searchParams.get('token') ?? ''
      const now = Date.now()
      const page = pages.get(token) ?? {
        token,
        href: '',
        loadedAt: now,
        lastPoll: now,
      }
      page.href = url.searchParams.get('href') ?? page.href
      page.lastPoll = now
      pages.set(token, page)
      const at = queue.findIndex(j => j.token === token)
      if (at === -1) {
        res.statusCode = 204
        res.end()
        return
      }
      const [job] = queue.splice(at, 1)
      inFlight.set(job!.id, job!)
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({ id: job!.id, code: job!.code, answer: job!.answer }),
      )
      return
    }
    if (url.pathname === '/__eval/result') {
      let data = ''
      req.on('data', chunk => (data += chunk))
      req.on('end', () => {
        const body = JSON.parse(data) as {
          id: number
          value?: unknown
          error?: string
        }
        const job = inFlight.get(body.id)
        inFlight.delete(body.id)
        if (body.error !== undefined) job?.reject(new Error(body.error))
        else job?.resolve(body.value)
        res.statusCode = 204
        res.end()
      })
      return
    }
    if (!url.pathname.startsWith(BASE)) {
      res.statusCode = 404
      res.end()
      return
    }
    let rel = url.pathname.slice(BASE.length)
    if (rel.endsWith('/') || rel === '') rel += 'index.html'
    const file = path.join(root, rel)
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.statusCode = 404
      res.end()
      return
    }
    res.setHeader(
      'content-type',
      MIME[path.extname(file)] ?? 'application/octet-stream',
    )
    if (file.endsWith('.html')) {
      res.end(
        fs
          .readFileSync(file, 'utf8')
          .replace(
            '</head>',
            '<script src="/__eval/bridge.js"></script></head>',
          ),
      )
      return
    }
    fs.createReadStream(file).pipe(res)
  })

  // Chrome throttles timers in a background tab to one a second, so a page
  // polling every 250 ms can still go a second between polls.
  const live = () =>
    [...pages.values()]
      .filter(p => Date.now() - p.lastPoll < 5000)
      .toSorted((a, b) => b.loadedAt - a.loadedAt)

  return new Promise<{
    origin: string
    newestSince: (after: number) => Page | undefined
    evaluate: (
      page: Page,
      code: string,
      answer?: string,
      timeoutMs?: number,
    ) => Promise<unknown>
    close: () => void
  }>(resolve => {
    server.listen(0, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const origin = `http://localhost:${port}`
      resolve({
        origin,
        newestSince: after => live().find(p => p.loadedAt > after),
        evaluate: (page, code, answer = '', timeoutMs = 60_000) =>
          new Promise((resolveValue, reject) => {
            const id = ++nextId
            const timer = setTimeout(() => {
              inFlight.delete(id)
              const at = queue.findIndex(j => j.id === id)
              if (at !== -1) queue.splice(at, 1)
              reject(new Error(`page evaluation ${id} timed out`))
            }, timeoutMs)
            queue.push({
              id,
              token: page.token,
              code,
              answer,
              resolve: v => {
                clearTimeout(timer)
                resolveValue(v)
              },
              reject: e => {
                clearTimeout(timer)
                reject(e)
              },
            })
          }),
        close: () => server.close(),
      })
    })
  })
}

interface Block {
  type: string
  name?: string
  input?: { action?: string; text?: string }
  content?: unknown
  is_error?: boolean
}

interface StreamEvent {
  type: string
  message?: { content?: Block[] }
  duration_ms?: number
  total_cost_usd?: number
  num_turns?: number
  result?: string
}

// Keeps CLAUDE_CONFIG_DIR, which selects the logged-in account, and drops the
// variables that tie a child session to this one.
function childEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !k.startsWith('CLAUDE') || k === 'CLAUDE_CONFIG_DIR',
    ),
  )
}

function claudeChrome(
  prompt: string,
  systemPrompt: string,
  cwd: string,
  maxTurns: number,
) {
  const events: StreamEvent[] = []
  const child = spawn(
    'claude',
    [
      '-p',
      prompt,
      '--chrome',
      '--model',
      model,
      '--output-format',
      'stream-json',
      '--verbose',
      '--allowedTools',
      'mcp__claude-in-chrome,ToolSearch',
      '--disallowedTools',
      'Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Task,TodoWrite',
      '--append-system-prompt',
      systemPrompt,
      '--max-turns',
      String(maxTurns),
    ],
    { cwd, env: childEnv(), stdio: ['ignore', 'pipe', 'inherit'] },
  )
  readline.createInterface({ input: child.stdout }).on('line', line => {
    try {
      events.push(JSON.parse(line) as StreamEvent)
    } catch {
      // stream-json interleaves the odd non-JSON line
    }
  })
  return new Promise<StreamEvent[]>(resolve =>
    child.on('close', () => resolve(events)),
  )
}

async function discoverDevice(cwd: string) {
  const events = await claudeChrome(
    'Call list_connected_browsers and reply with only the raw JSON it returned.',
    'You are a probe. Make the one tool call asked for and reply with its raw result.',
    cwd,
    4,
  )
  const text = events.find(ev => ev.type === 'result')?.result ?? ''
  const found = /"deviceId"\s*:\s*"([^"]+)"/.exec(text)
  if (!found)
    throw new Error(
      `list_connected_browsers returned no deviceId: ${text.slice(0, 300)}. Sign the extension in to the account claude uses.`,
    )
  return found[1]!
}

const resultText = (block: Block) =>
  typeof block.content === 'string'
    ? block.content
    : JSON.stringify(block.content ?? '')

function count(events: StreamEvent[]) {
  const calls = {
    javascript: 0,
    clicks: 0,
    screenshots: 0,
    other: 0,
    errors: 0,
  }
  let blocked = 0
  let truncated = 0
  for (const ev of events) {
    for (const block of ev.message?.content ?? []) {
      if (block.type === 'tool_use') {
        const name = (block.name ?? '').replace(/^mcp__claude-in-chrome__/, '')
        const action = block.input?.action ?? ''
        if (name === 'javascript_tool') calls.javascript++
        else if (name === 'computer' && action.includes('click')) calls.clicks++
        else if (name === 'computer' && action === 'screenshot')
          calls.screenshots++
        else if (name !== 'ToolSearch') calls.other++
      }
      if (block.type === 'tool_result') {
        const text = resultText(block)
        if (block.is_error) calls.errors++
        blocked += text.split('[BLOCKED').length - 1
        truncated += text.split('[TRUNCATED').length - 1
      }
    }
  }
  const result = events.find(ev => ev.type === 'result')
  return {
    ...calls,
    blocked,
    truncated,
    turns: result?.num_turns ?? 0,
    seconds: Math.round((result?.duration_ms ?? 0) / 1000),
    usd: Number((result?.total_cost_usd ?? 0).toFixed(3)),
    answer: result?.result ?? '',
  }
}

fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync('node_modules/.cache', { recursive: true })
const buildDir = fs.mkdtempSync(
  path.join('node_modules/.cache', 'bender-eval-'),
)
console.log('building the site')
await build({ outDir: buildDir, logLevel: 'error' })
const bridge = await serve(path.resolve(buildDir))
const appUrl = `${bridge.origin}${BASE}/app/`
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bender-agent-eval-cwd-'))

if (!deviceId) {
  deviceId = await discoverDevice(cwd)
  console.log(`connected browser ${deviceId}`)
}

const systemPrompt = `You are playing bender, a circuit-bent toy keyboard and drum machine, through the Claude in Chrome tools. Open ${appUrl} in the only connected browser, whose deviceId is ${deviceId}: call select_browser with it before the first browser action and do not ask which browser to use. The page exposes window.bender, a scripting API; evaluate bender.help for the contract, then orient with bender.summary(). javascript_tool returns the value of the last expression. Do the task, check the result, then reply with one line. Do not ask questions and do not open other sites.`

// Each session opens the app in a tab of its own, so the grader reads the page
// loaded most recently after the session started, then stops its audio and
// blanks the tab.
async function grade(task: Task, startedAt: number, answer: string) {
  const page = bridge.newestSince(startedAt)
  if (!page) return { pass: false, detail: 'the agent never loaded the app' }
  try {
    const graded = (await bridge.evaluate(page, task.grade, answer)) as {
      pass?: boolean
      detail?: unknown
    } | null
    return { pass: graded?.pass === true, detail: graded?.detail }
  } catch (e) {
    return { pass: false, detail: `grader threw: ${String(e)}` }
  } finally {
    await bridge
      .evaluate(
        page,
        `bender.stop(); setTimeout(() => location.replace('about:blank'), 50); return true`,
        '',
        10_000,
      )
      .catch(() => undefined)
  }
}

const rows: Record<string, unknown>[] = []
try {
  for (const task of TASKS.filter(t => t.name.includes(filter))) {
    const startedAt = Date.now()
    const events = await claudeChrome(task.prompt, systemPrompt, cwd, 30)
    const counted = count(events)
    const verdict = await grade(task, startedAt, counted.answer)
    const row = { task: task.name, ...verdict, ...counted }
    rows.push(row)
    fs.writeFileSync(
      path.join(outDir, `${task.name}.json`),
      JSON.stringify({ task, row, events }, null, 2),
    )
    console.log(
      `${verdict.pass ? 'pass' : 'FAIL'}  ${task.name.padEnd(16)} js=${counted.javascript} clicks=${counted.clicks} shots=${counted.screenshots} other=${counted.other} errors=${counted.errors} blocked=${counted.blocked} truncated=${counted.truncated} ${counted.seconds}s $${counted.usd}`,
    )
    console.log(`      ${JSON.stringify(verdict.detail)}`)
    console.log(`      answer: ${counted.answer.slice(0, 240)}`)
  }
} finally {
  bridge.close()
  fs.rmSync(buildDir, { recursive: true, force: true })
}

const passed = rows.filter(r => r.pass).length
console.log(
  `\n${passed}/${rows.length} passed on ${model}. Transcripts: ${outDir}`,
)
fs.writeFileSync(
  path.join(outDir, 'summary.json'),
  JSON.stringify(rows, null, 2),
)
process.exitCode = passed === rows.length ? 0 : 1

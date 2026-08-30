import { execFileSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'

// Enough of the devtools protocol to open a page, ask it a question, drive it
// and listen to what it says back. Shared by the two scripts that need a real
// browser rather than jsdom: figure.ts, which takes the README's picture, and
// panel.ts, which measures what the panel costs the main thread.
//
// A protocol socket rather than a browser library, so the repo owes nothing to
// a 300 MB dependency for two scripts nobody runs in CI.

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function which(cmd: string) {
  try {
    return execFileSync('which', [cmd]).toString().trim()
  } catch {
    return ''
  }
}

// The app bundles are named outright because a Mac keeps Chrome inside one and
// puts nothing on PATH, so a lookup that only walks PATH finds nothing on the
// machine most of this was written on.
const BUNDLES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]

export function chromePath(): string {
  const found = [
    process.env.BENDER_CHROME,
    'google-chrome',
    'chromium',
    'chromium-browser',
  ].find(c => c && (c.includes('/') ? true : which(c)))
  if (found) return found
  const bundle = BUNDLES.find(b => {
    try {
      accessSync(b, constants.X_OK)
      return true
    } catch {
      return false
    }
  })
  if (!bundle) throw new Error('no chrome found — set BENDER_CHROME')
  return bundle
}

export interface Page {
  /** Call a protocol method and hand back whatever it answered. */
  send: <T>(method: string, params?: object) => Promise<T>
  /** Listen for a protocol event. The params arrive as they came off the wire. */
  on: (method: string, fn: (params: unknown) => void) => void
  close: () => void
}

interface Target {
  type?: string
  webSocketDebuggerUrl?: string
}

export async function attach(port: number): Promise<Page> {
  let socket = ''
  for (let i = 0; i < 150 && !socket; i++) {
    try {
      const all: unknown = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json()
      const targets: Target[] = Array.isArray(all) ? all : []
      socket =
        targets.find(t => t.type === 'page')?.webSocketDebuggerUrl ?? socket
    } catch {
      await sleep(100)
    }
    if (!socket) await sleep(100)
  }
  if (!socket) throw new Error('chrome never opened a page')

  const ws = new WebSocket(socket)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  const waiting = new Map<number, (v: unknown) => void>()
  const listeners = new Map<string, ((params: unknown) => void)[]>()
  let id = 0
  ws.addEventListener('message', e => {
    const msg: unknown = JSON.parse(String(e.data))
    const {
      id: at,
      method,
      result,
      params,
    } = msg as {
      id?: number
      method?: string
      result?: unknown
      params?: unknown
    }
    if (at !== undefined) {
      waiting.get(at)?.(result)
      waiting.delete(at)
    } else if (method !== undefined) {
      for (const fn of listeners.get(method) ?? []) fn(params)
    }
  })
  return {
    send: <T>(method: string, params: object = {}) =>
      new Promise<T>(resolve => {
        const at = ++id
        waiting.set(at, resolve as (v: unknown) => void)
        ws.send(JSON.stringify({ id: at, method, params }))
      }),
    on: (method, fn) => {
      const had = listeners.get(method)
      if (had) had.push(fn)
      else listeners.set(method, [fn])
    },
    close: () => ws.close(),
  }
}

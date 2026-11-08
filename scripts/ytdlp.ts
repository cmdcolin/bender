import type { Plugin } from 'vite'

import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

// The dev server's yt-dlp bridge for the tape loop, after videoskillet's:
// `/yt?url=<link>` runs yt-dlp for the audio, caches it in a temp dir, and
// hands the bytes back for the page to decode onto the tape. Only `astro dev`
// mounts it, and only when yt-dlp is on PATH; the page reads `__YTDLP__` to
// decide whether to offer the URL row at all.

const CACHE_DIR = join(tmpdir(), 'bender-yt')

const FORMAT = 'ba[ext=m4a]/ba/b'

export const isFetchable = (u: string) => {
  try {
    const { protocol } = new URL(u)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export const isSameOrigin = (
  host: string | undefined,
  origin: string | undefined,
  fetchSite: string | undefined,
) => {
  const siteOk =
    fetchSite === undefined ||
    fetchSite === 'same-origin' ||
    fetchSite === 'none'
  return siteOk && (origin === undefined || originHost(origin) === host)
}

const originHost = (origin: string) => {
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}

const keyOf = (url: string) =>
  createHash('sha1').update(`${FORMAT}\n${url}`).digest('hex')

const filesFor = (key: string) =>
  existsSync(CACHE_DIR)
    ? readdirSync(CACHE_DIR).filter(n => n.startsWith(`${key}.`))
    : []

const isWorkingFile = (name: string) =>
  name.includes('.tmp.') ||
  name.endsWith('.part') ||
  name.endsWith('.ytdl') ||
  name.endsWith('.title')

const cached = (key: string) => {
  const audio = filesFor(key).find(n => !isWorkingFile(n))
  const titleFile = join(CACHE_DIR, `${key}.title`)
  return audio === undefined || !existsSync(titleFile)
    ? undefined
    : {
        file: join(CACHE_DIR, audio),
        title: readFileSync(titleFile, 'utf8').trim(),
      }
}

export interface Fetched {
  file: string
  title: string
}

const inflight = new Map<string, Promise<Fetched>>()

const PROGRESS_MARK = 'bender'

export interface Progress {
  loaded: number
  total: number
}

const fetching = new Map<string, Progress>()

const bytes = (field: string | undefined) => {
  const n = Number(field)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const readProgress = (line: string): Progress | undefined => {
  const [mark, loaded, total] = line.trim().split(' ')
  return mark === PROGRESS_MARK && total !== undefined
    ? { loaded: bytes(loaded), total: bytes(total) }
    : undefined
}

const startFetch = (key: string, url: string) => {
  const p = new Promise<Fetched>((resolve, reject) => {
    mkdirSync(CACHE_DIR, { recursive: true })
    for (const stale of filesFor(key)) rmSync(join(CACHE_DIR, stale))
    const child = spawn(
      'yt-dlp',
      [
        '-f',
        FORMAT,
        '--no-playlist',
        '--force-overwrites',
        '--newline',
        '--progress',
        '--progress-template',
        `${PROGRESS_MARK} %(progress.downloaded_bytes)s %(progress.total_bytes,progress.total_bytes_estimate)s`,
        '--no-simulate',
        '--print',
        'after_move:title',
        '-o',
        join(CACHE_DIR, `${key}.tmp.%(ext)s`),
        '--',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    fetching.set(key, { loaded: 0, total: 0 })
    let pending = ''
    let title = ''
    let err = ''
    child.stdout.on('data', d => {
      const lines = (pending + String(d)).split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        const at = readProgress(line)
        if (at) fetching.set(key, at)
        else if (line.trim()) title = line.trim()
      }
    })
    child.stderr.on('data', d => (err += String(d)))
    child.on('error', reject)
    child.on('close', code => {
      fetching.delete(key)
      const got = filesFor(key).find(
        n =>
          n.includes('.tmp.') && !n.endsWith('.part') && !n.endsWith('.ytdl'),
      )
      if (code === 0 && got !== undefined) {
        const file = join(CACHE_DIR, `${key}${extname(got)}`)
        const named = title || pending.trim() || url
        renameSync(join(CACHE_DIR, got), file)
        writeFileSync(join(CACHE_DIR, `${key}.title`), named)
        resolve({ file, title: named })
      } else {
        reject(
          new Error(
            err.trim().split('\n').at(-1) || `yt-dlp exited with ${code}`,
          ),
        )
      }
    })
  }).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export const fetchAudio = (url: string) => {
  const key = keyOf(url)
  const hit = cached(key)
  return hit === undefined
    ? (inflight.get(key) ?? startFetch(key, url))
    : Promise.resolve(hit)
}

export const hasYtdlp = () =>
  new Promise<boolean>(resolve => {
    execFile('yt-dlp', ['--version'], err => resolve(err === null))
  })

export function ytdlp(): Plugin {
  return {
    name: 'bender:ytdlp',
    apply: 'serve',
    async config() {
      return { define: { __YTDLP__: JSON.stringify(await hasYtdlp()) } }
    },
    configureServer(server) {
      server.middlewares.use('/yt', (req, res) => {
        const asked = new URL(req.url ?? '', 'http://localhost')
        const target = asked.searchParams.get('url') ?? ''
        const header = (name: string) => {
          const v = req.headers[name]
          return Array.isArray(v) ? v[0] : v
        }
        if (
          !isSameOrigin(
            header('host'),
            header('origin'),
            header('sec-fetch-site'),
          )
        ) {
          res.statusCode = 403
          res.end('the bridge answers only the app served from this host')
        } else if (!isFetchable(target)) {
          res.statusCode = 400
          res.end('not an http(s) URL')
        } else if (asked.pathname === '/progress') {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-store',
            connection: 'keep-alive',
          })
          const key = keyOf(target)
          let last = ''
          const timer = setInterval(() => {
            const at = fetching.get(key)
            const line = at === undefined ? '' : JSON.stringify(at)
            if (line !== '' && line !== last) {
              last = line
              res.write(`data: ${line}\n\n`)
            }
          }, 250)
          req.on('close', () => clearInterval(timer))
        } else {
          server.config.logger.info(`[yt-dlp] ${target}`)
          fetchAudio(target).then(
            ({ file, title }) => {
              res.writeHead(200, {
                'content-type': 'application/octet-stream',
                'content-length': String(statSync(file).size),
                'cache-control': 'no-store',
                'x-title': encodeURIComponent(title),
              })
              createReadStream(file).pipe(res)
            },
            (e: unknown) => {
              res.statusCode = 502
              res.end(`yt-dlp: ${e instanceof Error ? e.message : String(e)}`)
            },
          )
        }
      })
    },
  }
}

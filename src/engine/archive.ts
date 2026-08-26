// A sample rolled live off archive.org, so the sampler has something in it
// without you going and finding a file first.
//
// Two measured facts decide the shape of this, and both are easy to undo by
// accident.
//
// **`/cors/` is the endpoint to use.** `/download/` and `/serve/` answer with a
// 302 to a storage node — today that node happens to send
// `access-control-allow-origin: *`, but the redirect is off-host and outside
// the archive's CORS contract, and it is the exact hop that has been observed
// answering with no `access-control-*` header at all. `/cors/<id>/<file>`
// answers 200 with the request Origin echoed back and no redirect anywhere, so
// it works from a hosted build with no dev proxy and nothing to fall over.
//
// **`/cors/` ignores `Range`.** Ask it for the first megabyte and it answers 200
// with the whole file and no `content-range`, so a byte range cannot make a roll
// cheaper. Reading the body and letting go of it part way through can: the
// stream is cancelled, the connection closes, and the rest never crosses the
// wire. Which is what makes the cap below a cap on the wait rather than only on
// the buffer — and it is why an item whose metadata will not say how long it
// runs is still safe to open.
//
// **`archive.org/metadata/<id>` intermittently hangs for half a minute** and
// then answers with no `files` at all. A roll opens several items in series, so
// without a deadline on each read one stall eats the whole roll — and the roll
// that would have worked on its second try never gets to make it. The healthy
// case is well under a second, so the timeout below is far above it and far
// below the stall.

/** A pool is a search, and a roll picks something out of it. */
export interface Pool {
  label: string
  query: string
  blurb: string
}

export const POOLS: readonly Pool[] = [
  // 309k sides of shellac, transferred flat. Surface noise, a rolled-off top and
  // wow already on the recording before the board touches it, which is most of
  // the way to what the tape machine downstream is pretending to be.
  {
    label: '78s',
    query: 'collection:78rpm',
    blurb: 'shellac transfers — crackle and wow already on them',
  },
  // The Conet Project: 29 discs of shortwave numbers stations. Recorded off air,
  // so the carrier, the fading and the interference are all in there.
  {
    label: 'numbers stations',
    query: 'collection:irdial',
    blurb: 'shortwave numbers stations, recorded off air',
  },
  {
    label: 'old-time radio',
    query: 'collection:oldtimeradio',
    blurb: 'broadcast voice, band-limited and compressed',
  },
  {
    label: 'NASA audio',
    query: 'collection:nasaaudiocollection',
    blurb: 'comms chatter, squelch and countdowns',
  },
  {
    label: 'spoken word',
    query: 'collection:audio_bookspoetry',
    blurb: 'readings and poetry',
  },
]

const SEARCH = 'https://archive.org/advancedsearch.php'
const METADATA = 'https://archive.org/metadata/'
const CORS_FILES = 'https://archive.org/cors/'
export const DETAILS = 'https://archive.org/details/'

/** How far into the result set a roll is allowed to land. `sort[]=random` does
    not vary between calls on its own — the offset is where the variation comes
    from. */
const PAGE_SPAN = 200
/** How many items one search brings back, all of which a roll will open before
    it gives up. Some pools are far patchier than others — most of an old-time
    radio item is mp3, while a NASA one is as likely to be a zip or the lossless
    master with no derivative beside it — and a metadata read on an item with
    nothing on it is cheap and quick. Five of eight left that pool failing a roll
    in three; opening all twelve is the difference between a pool that works and
    one you have to click twice. */
const CANDIDATES = 12

/** There is deliberately no cap on how big a file may be or how long it may run.
    There was one, and it was the reason the NASA pool failed a roll in three:
    what is in there is mission audio, which is hours of tape per item, so a
    fifteen-minute limit threw away the pool rather than protecting anything.
    Nothing needs protecting — the read below stops at FETCH_CAP_BYTES whatever
    the file claims, so a five-hour recording and a three-minute 78 cost the same
    download and the same buffer. What is left is a preference for the smallest
    mp3 in the item, which is about the wait and not about safety.
*/
/** How much of the file is worth pulling. An mp3 is a stream of self-contained
    frames, so the front of one decodes on its own and the tail is only ever
    going to be cut off at LOAD_SECONDS anyway — this is several minutes at any
    bitrate the archive serves, and it turns a 15 MB radio show into a download
    nobody waits for. */
const FETCH_CAP_BYTES = 6_000_000
/** How much of whatever comes back actually goes on the tape. Long enough to be
    a piece of music rather than a hit, short enough that the buffer and the trip
    across to the audio thread are both unremarkable. */
export const LOAD_SECONDS = 90

/** Under a second when it is healthy, half a minute when it is not — see above. */
const READ_TIMEOUT_MS = 8_000
const DOWNLOAD_TIMEOUT_MS = 90_000

/** Decoders that every browser running an AudioWorklet can be relied on for.
    Flac and Ogg are patchier, and a WAVE off this archive is the lossless
    master — which the front of decodes fine, but at 10 MB a minute the cap
    would land a few seconds in. Nearly every item here carries an mp3 beside
    those, so asking for one costs almost no coverage. */
const PLAYABLE = /\.mp3$/i

export interface Take {
  id: string
  title: string
  file: string
  bytes: number
  seconds: number
}

export const detailsUrl = (id: string) => DETAILS + encodeURIComponent(id)

// `fl[]` and `sort[]` repeat their key, which URLSearchParams handles, but the
// brackets have to survive — archive.org reads `fl[]`, not `fl`.
export function searchUrl(query: string, page: number): string {
  const params = new URLSearchParams({
    q: `${query} AND mediatype:audio`,
    rows: String(CANDIDATES),
    page: String(page),
    output: 'json',
  })
  params.append('fl[]', 'identifier')
  params.append('fl[]', 'title')
  params.append('sort[]', 'random')
  return `${SEARCH}?${params.toString()}`
}

// Every path segment escaped, because the file names on this archive carry
// spaces, commas and apostrophes as a matter of course.
export const corsUrl = (id: string, file: string) =>
  CORS_FILES +
  encodeURIComponent(id) +
  '/' +
  file.split('/').map(encodeURIComponent).join('/')

const docsIn = (body: unknown): Record<string, unknown>[] => {
  const docs = (body as { response?: { docs?: unknown } })?.response?.docs
  return Array.isArray(docs) ? (docs as Record<string, unknown>[]) : []
}

/** How many pages of results the pool actually has, from a search that may have
    landed past the end of it. */
export function pageCount(body: unknown): number {
  const n = (body as { response?: { numFound?: unknown } })?.response?.numFound
  return typeof n === 'number' && n > 0 ? Math.ceil(n / CANDIDATES) : 0
}

export function candidatesIn(body: unknown): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = []
  for (const d of docsIn(body)) {
    const id = d.identifier
    if (typeof id !== 'string' || !id) continue
    const raw = d.title
    out.push({ id, title: typeof raw === 'string' && raw ? raw : id })
  }
  return out
}

/**
 * The smallest playable derivative inside the caps, or nothing.
 *
 * Smallest rather than best: this is going through a bent toy, a crusher and a
 * tape machine, so the difference between a 128 kbps mp3 and a VBR one is not
 * going to survive the first bend — and what it buys is the wait before you can
 * play the thing.
 */
export function pickFile(
  id: string,
  title: string,
  body: unknown,
): Take | null {
  const files = (body as { files?: unknown })?.files
  if (!Array.isArray(files)) return null
  let best: Take | null = null
  for (const f of files as Record<string, unknown>[]) {
    const name = f.name
    if (typeof name !== 'string' || !PLAYABLE.test(name)) continue
    const bytes = Number(f.size)
    if (!Number.isFinite(bytes) || bytes <= 0) continue
    // Absent on plenty of derivatives, and nothing turns on it — it is reported
    // rather than judged on.
    const seconds = Number(f.length)
    if (!best || bytes < best.bytes) {
      best = {
        id,
        title,
        file: name,
        bytes,
        seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
      }
    }
  }
  return best
}

// A read that cannot hang the roll behind it. Its own controller rather than
// only the caller's, and the caller's aborts it too.
async function readJson(
  url: string,
  fetcher: typeof globalThis.fetch,
  signal: AbortSignal | undefined,
  ms: number,
): Promise<unknown> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  const onAbort = () => ctl.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetcher(url, { signal: ctl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

// As much of the body as the cap allows, then let go of the rest. Cancelling
// the reader closes the connection, so what is skipped is never sent — a whole
// file falls back to arrayBuffer only where the body cannot be streamed.
async function readCapped(res: Response, cap: number): Promise<ArrayBuffer> {
  const body = res.body
  if (!body) return res.arrayBuffer()
  const reader = body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  try {
    while (total < cap) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      total += value.length
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const out = new Uint8Array(Math.min(total, cap))
  let at = 0
  for (const part of parts) {
    if (at >= out.length) break
    const take = Math.min(part.length, out.length - at)
    out.set(part.subarray(0, take), at)
    at += take
  }
  return out.buffer
}

export interface Rolled extends Take {
  data: ArrayBuffer
}

export interface RollOpts {
  pool: Pool
  /** 0..1. The page a roll lands on, and so which slice of the pool it sees. */
  rng: () => number
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  /** What to say while it works — a roll can take a few seconds. */
  onStep?: (message: string) => void
}

/**
 * Search the pool, open items until one has a file worth having, and bring the
 * bytes back. Null when the pool, the network or the caller says no.
 */
export async function roll(opts: RollOpts): Promise<Rolled | null> {
  const fetcher = opts.fetch ?? globalThis.fetch
  const step = opts.onStep ?? (() => {})
  const page = 1 + Math.floor(opts.rng() * PAGE_SPAN)

  step(`searching ${opts.pool.label}…`)
  const search = (at: number) =>
    readJson(
      searchUrl(opts.pool.query, at),
      fetcher,
      opts.signal,
      READ_TIMEOUT_MS,
    )
  let found = await search(page)
  let candidates = candidatesIn(found)
  // A pool smaller than the span of pages a roll can land on — the Conet
  // Project is 29 items — answers an offset past its end with no documents at
  // all. It still says how many it has, though, so the second look is aimed
  // rather than lucky. Only ever one retry: an empty answer from a pool that
  // says it is empty is an answer.
  if (!candidates.length) {
    const pages = pageCount(found)
    if (pages <= 0) return null
    found = await search(1 + Math.floor(opts.rng() * pages))
    candidates = candidatesIn(found)
    if (!candidates.length) return null
  }

  for (let i = 0; i < candidates.length; i++) {
    if (opts.signal?.aborted) return null
    const { id, title } = candidates[i]!
    step(`reading ${title}…`)
    const meta = await readJson(
      METADATA + encodeURIComponent(id),
      fetcher,
      opts.signal,
      READ_TIMEOUT_MS,
    )
    if (!meta) continue
    const take = pickFile(id, title, meta)
    if (!take) continue

    step(`fetching ${title} (${Math.round(take.bytes / 100_000) / 10} MB)…`)
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), DOWNLOAD_TIMEOUT_MS)
    const onAbort = () => ctl.abort()
    opts.signal?.addEventListener('abort', onAbort)
    try {
      const res = await fetcher(corsUrl(take.id, take.file), {
        signal: ctl.signal,
      })
      if (!res.ok) continue
      return { ...take, data: await readCapped(res, FETCH_CAP_BYTES) }
    } catch {
      continue
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }
  return null
}

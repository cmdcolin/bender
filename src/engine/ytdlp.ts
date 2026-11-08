declare const __YTDLP__: boolean

/** Whether the dev server has the yt-dlp bridge (`scripts/ytdlp.ts`) up. */
export const hasYtdlp = __YTDLP__

const endpoint = (path: string, url: string) =>
  `/yt${path}?url=${encodeURIComponent(url)}`

export const fetchLink = async (url: string, signal: AbortSignal) => {
  const r = await fetch(endpoint('', url), { signal })
  return r.ok
    ? {
        title: decodeURIComponent(r.headers.get('x-title') ?? '') || url,
        data: await r.arrayBuffer(),
      }
    : Promise.reject(new Error((await r.text()) || `${r.status}`))
}

const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1)

export const progressText = (loaded: number, total: number) =>
  total > 0
    ? `fetching with yt-dlp… ${megabytes(loaded)} of ${megabytes(total)} MB`
    : `fetching with yt-dlp… ${megabytes(loaded)} MB`

const isProgress = (v: unknown): v is { loaded: number; total: number } =>
  typeof v === 'object' &&
  v !== null &&
  'loaded' in v &&
  'total' in v &&
  typeof v.loaded === 'number' &&
  typeof v.total === 'number'

/** Follows a fetch already in flight; the caller closes it when that settles. */
export const watchLink = (url: string, onStep: (text: string) => void) => {
  const events = new EventSource(endpoint('/progress', url))
  events.addEventListener('message', e => {
    const at: unknown = JSON.parse(String(e.data))
    if (isProgress(at) && at.loaded > 0)
      onStep(progressText(at.loaded, at.total))
  })
  events.addEventListener('error', () => events.close())
  return () => events.close()
}

/** The link as the panel credits it: host and path, without the scheme. */
export const linkCredit = (url: string) => {
  const { host, pathname, search } = new URL(url)
  return `${host.replace(/^www\./, '')}${pathname === '/' ? '' : pathname}${search}`
}

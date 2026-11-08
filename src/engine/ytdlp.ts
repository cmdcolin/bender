declare const __YTDLP__: boolean

/** Whether the dev server has the yt-dlp bridge (`scripts/ytdlp.ts`) up. */
export const hasYtdlp = __YTDLP__

export const fetchLink = async (url: string, signal: AbortSignal) => {
  const r = await fetch(`/yt?url=${encodeURIComponent(url)}`, { signal })
  return r.ok
    ? {
        title: decodeURIComponent(r.headers.get('x-title') ?? '') || url,
        data: await r.arrayBuffer(),
      }
    : Promise.reject(new Error((await r.text()) || `${r.status}`))
}

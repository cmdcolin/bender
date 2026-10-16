// Where a take's samples go while it records.
//
// - **A file** in the origin-private file system, written a slab at a time.
//   The tab holds one slab, and the quota the browser grants caps the take.
// - **Blobs** in memory, where the browser has no `createWritable` or the
//   origin has no private file system. `MEMORY_MAX` caps the take.
//
// A file take reserves the header up front and writes the real one over it on
// close. `createWritable` commits nothing until `close`, so a tab that dies
// mid-take loses it; `sweepTakes` clears what it leaves.

import { wavHeader } from './wav'

export interface WavSink {
  write: (pcm: Int16Array<ArrayBuffer>) => void
  close: () => Promise<File>
  discard: () => void
}

export interface Take {
  wav: (name: string, channels: 1 | 2) => WavSink
  /** Bytes the take may still write before it must stop. */
  room: () => number
  /** Why a write failed, or '' while none has. */
  failure: () => string
  /** Lets the sweep reclaim the take's folder once its files are old. */
  end: () => void
}

const DIR = 'takes'
const KEEP_MS = 10 * 60 * 1000
const MEMORY_MAX = 128 * 1024 * 1024
const STREAM_UNKNOWN = 2 * 1024 * 1024 * 1024
const STREAM_RESERVE = 256 * 1024 * 1024
const WAV_MAX = 0xffffffff - 36

const lockName = (id: string) => `bender-take-${id}`

export const blobForced = (
  search = typeof location === 'undefined' ? '' : location.search,
): boolean => new URLSearchParams(search).get('takesink') === 'blob'

const root = (): Promise<FileSystemDirectoryHandle | null> =>
  typeof navigator.storage?.getDirectory === 'function'
    ? navigator.storage.getDirectory().catch(() => null)
    : Promise.resolve(null)

async function granted(): Promise<number> {
  if (typeof navigator.storage?.estimate !== 'function') return STREAM_UNKNOWN
  const { quota, usage } = await navigator.storage
    .estimate()
    .catch(() => ({ quota: undefined, usage: undefined }))
  if (quota === undefined) return STREAM_UNKNOWN
  return Math.max(0, quota - (usage ?? 0) - STREAM_RESERVE)
}

const hasWritable = () =>
  typeof FileSystemFileHandle !== 'undefined' &&
  'createWritable' in FileSystemFileHandle.prototype

const noop = () => {}

function holdLock(id: string): { held: Promise<void>; release: () => void } {
  if (typeof navigator.locks?.request !== 'function')
    return { held: Promise.resolve(), release: noop }
  let release = noop
  const held = new Promise<void>(acquired => {
    void navigator.locks
      .request(
        lockName(id),
        () =>
          new Promise<void>(done => {
            release = done
            acquired()
          }),
      )
      .catch(() => acquired())
  })
  return { held, release: () => release() }
}

async function openDir(id: string): Promise<FileSystemDirectoryHandle | null> {
  if (blobForced() || !hasWritable()) return null
  const base = await root()
  if (base === null) return null
  try {
    const takes = await base.getDirectoryHandle(DIR, { create: true })
    return await takes.getDirectoryHandle(id, { create: true })
  } catch {
    return null
  }
}

export function openTake(sr: number): Take {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const lock = holdLock(id)
  const dir = lock.held.then(() => openDir(id)).catch(() => null)
  let free = MEMORY_MAX
  let written = 0
  let largest = 0
  let failure = ''

  const fail = (e: unknown) => {
    if (failure === '') failure = e instanceof Error ? e.message : String(e)
  }

  return {
    room: () => Math.min(free - written, WAV_MAX - largest),
    failure: () => failure,
    end: lock.release,
    wav: (name, channels) => {
      let bytes = 0
      let handle: FileSystemFileHandle | null = null
      let stream: FileSystemWritableFileStream | null = null
      const pieces: Blob[] = []

      let chain: Promise<void> = dir.then(async parent => {
        if (parent === null) return
        try {
          handle = await parent.getFileHandle(name, { create: true })
          stream = await handle.createWritable()
          await stream.write(wavHeader(0, channels, sr))
          free = await granted()
        } catch {
          handle = null
          stream = null
        }
      })

      const queue = (task: () => Promise<void> | void) => {
        chain = chain.then(task).catch(fail)
      }

      return {
        write: pcm => {
          bytes += pcm.byteLength
          written += pcm.byteLength
          largest = Math.max(largest, bytes)
          queue(() =>
            stream === null
              ? void pieces.push(new Blob([pcm]))
              : stream.write(pcm),
          )
        },
        close: async () => {
          await chain
          if (failure !== '') throw new Error(failure)
          const header = wavHeader(bytes, channels, sr)
          if (stream === null || handle === null) {
            return new File([header, ...pieces], name, { type: 'audio/wav' })
          }
          try {
            await stream.write({ type: 'write', position: 0, data: header })
            await stream.close()
          } catch (e) {
            fail(e)
            throw e
          }
          const file = await handle.getFile()
          return new File([file], name, { type: 'audio/wav' })
        },
        discard: () => {
          pieces.length = 0
          queue(async () => {
            await stream?.abort().catch(() => {})
            await (await dir)?.removeEntry(name).catch(() => {})
          })
        },
      }
    },
  }
}

export async function sweepTakes(now = Date.now()): Promise<number> {
  const base = await root()
  if (base === null || typeof navigator.locks?.query !== 'function') return 0
  try {
    const takes = await base.getDirectoryHandle(DIR, { create: false })
    const { held = [] } = await navigator.locks.query()
    const live = new Set(held.map(lock => lock.name))
    const stale: string[] = []
    for await (const [id, entry] of takes.entries()) {
      if (entry.kind !== 'directory' || live.has(lockName(id))) continue
      let newest = 0
      for await (const file of entry.values()) {
        if (file.kind !== 'file') continue
        const { lastModified } = await file.getFile()
        newest = Math.max(newest, lastModified)
      }
      if (now - newest > KEEP_MS) stale.push(id)
    }
    for (const id of stale) await takes.removeEntry(id, { recursive: true })
    return stale.length
  } catch {
    return 0
  }
}

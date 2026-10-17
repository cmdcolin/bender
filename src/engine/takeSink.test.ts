import { afterEach, expect, test, vi } from 'vitest'

import { openTake, sweepTakes } from './takeSink.ts'

interface Entry {
  kind: 'file' | 'directory'
  data: Uint8Array<ArrayBuffer>
  modified: number
  children: Map<string, Entry>
}

const entry = (kind: Entry['kind']): Entry => ({
  kind,
  data: new Uint8Array(),
  modified: Date.now(),
  children: new Map(),
})

class Writable {
  private swap: Uint8Array<ArrayBuffer>
  private target: Entry

  constructor(target: Entry) {
    this.target = target
    this.swap = new Uint8Array()
  }
  async write(
    chunk:
      | ArrayBufferView
      | { type: 'write'; position: number; data: Uint8Array },
  ) {
    const [at, bytes] =
      'type' in chunk
        ? [chunk.position, chunk.data]
        : [
            this.swap.length,
            new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
          ]
    const next = new Uint8Array(Math.max(this.swap.length, at + bytes.length))
    next.set(this.swap)
    next.set(bytes, at)
    this.swap = next
  }
  async close() {
    this.target.data = this.swap
    this.target.modified = Date.now()
  }
  abort() {
    return Promise.resolve()
  }
}

const handle = (name: string, node: Entry): unknown => {
  const self = {
    kind: node.kind,
    name,
    createWritable: async () => new Writable(node),
    getFile: async () =>
      new File([node.data], name, { lastModified: node.modified }),
    getDirectoryHandle: async (child: string, o?: { create?: boolean }) =>
      open(node, child, 'directory', o?.create),
    getFileHandle: async (child: string, o?: { create?: boolean }) =>
      open(node, child, 'file', o?.create),
    removeEntry: async (child: string) => {
      if (!node.children.delete(child)) throw new Error('not found')
    },
    entries: async function* () {
      for (const [n, e] of node.children) yield [n, handle(n, e)]
    },
    values: async function* () {
      for (const [n, e] of node.children) yield handle(n, e)
    },
  }
  return self
}

const open = (
  dir: Entry,
  name: string,
  kind: Entry['kind'],
  create?: boolean,
) => {
  let node = dir.children.get(name)
  if (!node) {
    if (!create) throw new Error('not found')
    node = entry(kind)
    dir.children.set(name, node)
  }
  return handle(name, node)
}

const SR = 48000

const stubBrowser = (opts: { opfs: boolean; quota?: number }) => {
  const root = entry('directory')
  const held = new Set<string>()
  const space = { quota: opts.quota ?? 1e12, usage: 0 }
  vi.stubGlobal('FileSystemFileHandle', {
    prototype: opts.opfs ? { createWritable: () => ({}) } : {},
  })
  vi.stubGlobal('navigator', {
    storage: opts.opfs
      ? {
          getDirectory: async () => handle('', root),
          estimate: async () => ({ ...space }),
        }
      : undefined,
    locks: {
      request: (name: string, run: () => Promise<void>) => {
        held.add(name)
        return run().finally(() => held.delete(name))
      },
      query: async () => ({ held: [...held].map(name => ({ name })) }),
    },
  })
  return { root, held, space }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const slab = (frames: number, value: number) =>
  new Int16Array(frames * 2).fill(value)

const readTake = async (opfs: boolean) => {
  stubBrowser({ opfs })
  const take = openTake(SR)
  const sink = take.wav('bender-1.wav', 2)
  sink.write(slab(4, 100))
  sink.write(slab(2, -200))
  const file = await sink.close()
  take.end()
  return new DataView(await file.arrayBuffer())
}

for (const opfs of [true, false]) {
  test(`${opfs ? 'a file' : 'a memory'} take comes back as one wav with the real header`, async () => {
    const v = await readTake(opfs)
    expect(v.byteLength).toBe(44 + 6 * 4)
    expect(v.getUint32(4, true)).toBe(36 + 6 * 4)
    expect(v.getUint32(40, true)).toBe(6 * 4)
    expect(v.getUint16(22, true)).toBe(2)
    expect(v.getUint32(24, true)).toBe(SR)
    expect(v.getInt16(44, true)).toBe(100)
    expect(v.getInt16(44 + 4 * 4, true)).toBe(-200)
  })
}

test('a file take keeps its name and type on the file it hands back', async () => {
  stubBrowser({ opfs: true })
  const take = openTake(SR)
  const sink = take.wav('bender-1.wav', 2)
  sink.write(slab(1, 1))
  const file = await sink.close()
  expect(file.name).toBe('bender-1.wav')
  expect(file.type).toBe('audio/wav')
})

test('a take runs out of room at the quota the browser grants, less the reserve', async () => {
  const reserve = 256 * 1024 * 1024
  stubBrowser({ opfs: true, quota: reserve + 100 })
  const take = openTake(SR)
  const sink = take.wav('bender-1.wav', 2)
  sink.write(slab(10, 1))
  await sink.close()
  expect(take.room()).toBe(100 - 40)
})

test('a memory take stops at the memory cap', () => {
  stubBrowser({ opfs: false })
  const take = openTake(SR)
  expect(take.room()).toBe(128 * 1024 * 1024)
  take.wav('bender-1.wav', 2).write(slab(1000, 1))
  expect(take.room()).toBe(128 * 1024 * 1024 - 4000)
})

test('a discarded sink leaves no file behind', async () => {
  const { root } = stubBrowser({ opfs: true })
  const take = openTake(SR)
  const sink = take.wav('bender-1.wav', 2)
  sink.write(slab(1, 1))
  sink.discard()
  await vi.waitFor(() => {
    const [dir] = root.children.get('takes')!.children.values()
    expect(dir!.children.size).toBe(0)
  })
})

test('the sweep clears an old take, and leaves a recording one and a fresh one', async () => {
  const { root } = stubBrowser({ opfs: true })
  const done = openTake(SR)
  const sink = done.wav('bender-1.wav', 2)
  sink.write(slab(1, 1))
  await sink.close()
  done.end()
  const recording = openTake(SR)
  const live = recording.wav('bender-2.wav', 2)
  live.write(slab(1, 1))
  await live.close()
  await vi.waitFor(() =>
    expect(root.children.get('takes')!.children.size).toBe(2),
  )

  expect(await sweepTakes()).toBe(0)
  const later = Date.now() + 11 * 60 * 1000
  expect(await sweepTakes(later)).toBe(1)
  expect(root.children.get('takes')!.children.size).toBe(1)
})

test('a take that streams to a file reports storage as what runs out first', async () => {
  stubBrowser({ opfs: true, quota: 1e9 })
  const take = openTake(SR)
  take.wav('bender-1.wav', 2)
  await vi.waitFor(() => expect(take.limit()).toBe('storage'))
})

test('a memory take reports memory as what runs out first', () => {
  stubBrowser({ opfs: false })
  expect(openTake(SR).limit()).toBe('memory')
})

test('a take asks the browser again, and stops short when the disk has filled meanwhile', async () => {
  const reserve = 256 * 1024 * 1024
  const { space } = stubBrowser({ opfs: true, quota: reserve + 1000 })
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    const take = openTake(SR)
    const sink = take.wav('bender-1.wav', 2)
    await vi.waitFor(() => expect(take.limit()).toBe('storage'))
    sink.write(slab(10, 1))
    expect(take.room()).toBe(1000 - 40)
    await new Promise(r => setTimeout(r))

    space.quota = reserve + 100
    space.usage = 40
    vi.setSystemTime(Date.now() + 6000)
    sink.write(slab(10, 1))
    await vi.waitFor(() => expect(take.room()).toBe(100 - 80))
  } finally {
    vi.useRealTimers()
  }
})

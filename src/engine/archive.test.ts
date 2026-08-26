import { expect, test } from 'vitest'
import {
  POOLS,
  candidatesIn,
  corsUrl,
  detailsUrl,
  pickFile,
  roll,
  searchUrl,
} from './archive'

test('every pool asks for audio and nothing else', () => {
  for (const p of POOLS) {
    const u = new URL(searchUrl(p.query, 1))
    expect(u.searchParams.get('q')).toBe(`${p.query} AND mediatype:audio`)
  }
})

// URLSearchParams is happy to send `fl` where the archive only reads `fl[]`,
// and a search that loses its brackets comes back with every field of every
// document instead of the two this wants.
test('the search keeps its bracketed keys and its random sort', () => {
  const u = new URL(searchUrl('collection:78rpm', 4))
  expect(u.searchParams.getAll('fl[]')).toEqual(['identifier', 'title'])
  expect(u.searchParams.getAll('sort[]')).toEqual(['random'])
  expect(u.searchParams.get('page')).toBe('4')
  expect(u.searchParams.get('output')).toBe('json')
})

// Names on this archive carry spaces, commas and apostrophes as a matter of
// course. Spaces have to go; an apostrophe is a legal path character and comes
// through as itself.
test('file names survive their spaces', () => {
  expect(corsUrl('78_belleville_x', "BELLEVILLE - JO PRIVAT's.mp3")).toBe(
    "https://archive.org/cors/78_belleville_x/BELLEVILLE%20-%20JO%20PRIVAT's.mp3",
  )
})

// A slash in a name is a path separator on this archive, not a character to
// escape — items really do carry files in folders.
test('a file in a folder keeps its separator', () => {
  expect(corsUrl('x', 'disc 1/track 2.mp3')).toBe(
    'https://archive.org/cors/x/disc%201/track%202.mp3',
  )
})

test('a details link points at the item page', () => {
  expect(detailsUrl('ird063')).toBe('https://archive.org/details/ird063')
})

test('a search body with no docs is no candidates rather than a throw', () => {
  expect(candidatesIn(null)).toEqual([])
  expect(candidatesIn({})).toEqual([])
  expect(candidatesIn({ response: { docs: 'nope' } })).toEqual([])
})

test('an item with no title is named by its identifier', () => {
  const got = candidatesIn({
    response: {
      docs: [{ identifier: 'ird063' }, { identifier: 'x', title: 'X' }],
    },
  })
  expect(got).toEqual([
    { id: 'ird063', title: 'ird063' },
    { id: 'x', title: 'X' },
  ])
})

const files = (...f: unknown[]) => ({ files: f })

test('the smallest mp3 inside the caps wins', () => {
  const got = pickFile(
    'id',
    'T',
    files(
      { name: 'big.mp3', size: '9000000', length: '120' },
      { name: 'small.mp3', size: '3000000', length: '120' },
      { name: 'master.wav', size: '100', length: '120' },
    ),
  )
  expect(got?.file).toBe('small.mp3')
  expect(got?.bytes).toBe(3000000)
})

// There used to be a length cap here and it threw away whole pools: NASA's
// items are hours of mission audio each, and a fifteen-minute limit rejected
// nearly all of them. Only the front of a file is ever read, so nothing about
// how long it runs is a reason to pass it over.
test('a file that runs for hours is still worth opening', () => {
  const got = pickFile(
    'id',
    'T',
    files({ name: 'apollo.mp3', size: '300000000', length: '18000' }),
  )
  expect(got?.file).toBe('apollo.mp3')
  expect(got?.seconds).toBe(18000)
})

test('a derivative that will not say how long it is still counts', () => {
  const got = pickFile('id', 'T', files({ name: 'a.mp3', size: '1000' }))
  expect(got?.file).toBe('a.mp3')
  expect(got?.seconds).toBe(0)
})

test('nothing playable and no metadata are both simply nothing', () => {
  expect(pickFile('id', 'T', files({ name: 'a.flac', size: '10' }))).toBeNull()
  expect(pickFile('id', 'T', {})).toBeNull()
  expect(pickFile('id', 'T', null)).toBeNull()
})

// The roll opens items in series, so one that answers with nothing usable must
// cost that item and not the roll.
test('a roll walks past items with nothing on them', async () => {
  const seen: string[] = []
  const fake = (async (url: string | URL) => {
    const u = String(url)
    seen.push(u)
    if (u.includes('advancedsearch')) {
      return json({
        response: {
          docs: [
            { identifier: 'empty' },
            { identifier: 'good', title: 'Good' },
          ],
        },
      })
    }
    if (u.includes('/metadata/empty'))
      return json(files({ name: 'a.flac', size: '1' }))
    if (u.includes('/metadata/good'))
      return json(files({ name: 'g.mp3', size: '1000', length: '30' }))
    return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 })
  }) as unknown as typeof globalThis.fetch

  const got = await roll({ pool: POOLS[0]!, rng: () => 0.5, fetch: fake })
  expect(got?.id).toBe('good')
  expect(got?.file).toBe('g.mp3')
  expect(got && new Uint8Array(got.data)).toEqual(new Uint8Array([1, 2, 3]))
  expect(seen.some(u => u.includes('/cors/good/g.mp3'))).toBe(true)
})

test('a search that answers with nothing is a roll that came back empty', async () => {
  const fake = (async () =>
    json({ response: { docs: [] } })) as unknown as typeof fetch
  expect(await roll({ pool: POOLS[0]!, rng: () => 0, fetch: fake })).toBeNull()
})

test('a network that refuses throughout is null rather than a throw', async () => {
  const fake = (async () => {
    throw new Error('offline')
  }) as unknown as typeof fetch
  await expect(
    roll({ pool: POOLS[0]!, rng: () => 0, fetch: fake }),
  ).resolves.toBeNull()
})

test('a roll already called off does not go and fetch anything', async () => {
  const ctl = new AbortController()
  ctl.abort()
  let calls = 0
  const fake = (async (url: string | URL) => {
    calls++
    return String(url).includes('advancedsearch')
      ? json({ response: { docs: [{ identifier: 'a' }] } })
      : json(files({ name: 'a.mp3', size: '10', length: '10' }))
  }) as unknown as typeof globalThis.fetch
  expect(
    await roll({
      pool: POOLS[0]!,
      rng: () => 0,
      fetch: fake,
      signal: ctl.signal,
    }),
  ).toBeNull()
  expect(calls).toBeLessThanOrEqual(1)
})

// The page is where the variation comes from: `sort[]=random` on its own hands
// back the same slice every time.
test('two rolls of the dice look at different pages', () => {
  const page = (r: number) =>
    new URL(searchUrl('q', 1 + Math.floor(r * 200))).searchParams.get('page')
  expect(page(0.1)).not.toBe(page(0.9))
})

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

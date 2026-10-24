// @vitest-environment jsdom
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { YOURS } from '../dsp/stages/roms.ts'
import { engine } from '../engine/engine.ts'
import { HOLD, REST, TUNE_LANE_KEYS } from '../tune.ts'
import { createBenderApi, GUIDE_MAX_CHARS } from './agentApi.ts'
import { boardFromUrl } from './share.ts'
import './testDom.ts'

const bender = createBenderApi()

test('set applies valid values and reports adjusted, unknown and failed ones', () => {
  const report = bender.set({
    chipStarve: 0.8,
    dlyFb: 9,
    chipTone: 'reed',
    chipStarv: 1,
    chipArp: 'sideways',
  })
  expect(report.applied).toMatchObject({
    chipStarve: '0.80',
    dlyFb: '2.00',
    chipTone: 'reed 1/4',
  })
  expect(report.adjusted).toEqual(['dlyFb: asked 9, set 2.00'])
  expect(report.unknown[0]).toMatch(
    /^chipStarv: no control has this key; closest keys: chipStarve/,
  )
  expect(report.failed[0]).toMatch(/^chipArp: no choice matches 'sideways'/)

  expect(engine.controls.get()).toMatchObject({
    chipStarve: 0.8,
    dlyFb: 2,
    chipTone: 1,
    chipArp: DEFAULT_CONTROLS.chipArp,
  })
})

test('each set call adds one undo step', () => {
  bender.set({ chipStarve: 0.5, dlyFb: 0.9 })
  bender.set({ chipStarve: 0.7 })
  expect(bender.summary().undo).toBe(2)
  bender.undo()
  expect(engine.controls.get()).toMatchObject({ chipStarve: 0.5, dlyFb: 0.9 })
  bender.undo()
  expect(engine.controls.get().chipStarve).toBe(DEFAULT_CONTROLS.chipStarve)
  expect(bender.summary().redo).toBe(2)
})

test('a set that changes no control adds no undo step', () => {
  bender.set({ chipStarve: DEFAULT_CONTROLS.chipStarve })
  bender.set({ nothing: 1 })
  expect(bender.summary().undo).toBe(0)
})

test('board lists changed controls by key, and its link loads the same board', () => {
  bender.set({ chipStarve: 0.8, chipTone: 'clav' })
  const board = bender.board()
  expect(board.preset).toBe('modified')
  expect(board.controls).toContain(
    'chipStarve = 0.80  (Power supply: Starve, default 0.00)',
  )
  expect(
    board.controls.some(row => row.startsWith('chipTone = clav 1/8')),
  ).toBe(true)
  const link = bender.link()
  expect(boardFromUrl('', link.slice(link.indexOf('#')))).toEqual({
    chipStarve: 0.8,
    chipTone: 2,
  })
})

test('find ranks an exact key or label match first', () => {
  expect(bender.find('starve').slice(0, 2).join('\n')).toMatch(
    /^chipStarve = /m,
  )
  expect(bender.find('wraith feedback').some(r => r.startsWith('dlyFb'))).toBe(
    true,
  )
  expect(bender.find()[0]).toMatch(/^\S.* \(\d+ controls\)$/)
})

test('find ranks a group named as a phrase above controls matching its words', () => {
  const rows = bender.find('wraith', 20)
  const at = (key: string) => rows.findIndex(r => r.startsWith(`${key} = `))
  expect(at('dlyMix')).toBeGreaterThanOrEqual(0)
  expect(at('dlyMix')).toBeLessThan(at('tapeMix') === -1 ? 99 : at('tapeMix'))
  expect(rows[at('dlyMix')]).toContain('Wraith: Echo level (mix)')
})

test('find rows stay short enough that the default page of them fits in one result', () => {
  for (const query of ['delay', 'wraith', 'signal order', 'drum']) {
    const rows = bender.find(query)
    expect(rows.length).toBeLessThanOrEqual(8)
    expect(JSON.stringify(rows).length).toBeLessThanOrEqual(1600)
  }
})

test('describe names find for a group name', () => {
  expect(() => bender.describe('wraith')).toThrow(
    "'wraith' is a group; bender.find('Wraith') lists its controls",
  )
})

test('help and every guide topic fit in one browser tool result', () => {
  expect(bender.help.length).toBeLessThanOrEqual(GUIDE_MAX_CHARS)
  for (const topic of ['read', 'change', 'music', 'drums', 'line', 'sound'])
    expect(bender.guide(topic).length).toBeLessThanOrEqual(GUIDE_MAX_CHARS)
  expect(() => bender.guide('nope')).toThrow(
    "no guide topic 'nope'; topics: read, change, music, drums, line, sound",
  )
})

test('describe lists a control’s choices and suggests keys for a typo', () => {
  expect(bender.describe('chipTone')).toMatchObject({
    key: 'chipTone',
    choices: 'organ 1/2 | reed 1/4 | clav 1/8 | buzz 1/16',
  })
  expect(() => bender.describe('drumLevl')).toThrow(
    'drumLevl: no control has this key; closest keys: drumLevel',
  )
  expect(() => bender.describe('volume')).toThrow(/bender.find\(words\)/)
})

test('tune writes the melody memory and switches the chip to play it', () => {
  const out = bender.tune(['C4 E4 | G4 ~ . C5', 'C3 ~ ~ ~'])
  const c = engine.controls.get()
  expect(c.chipTune).toBe(YOURS)
  expect(c.tuneLen).toBe(6)
  expect(TUNE_LANE_KEYS[0].slice(0, 7).map(k => c[k])).toEqual([
    3,
    7,
    10,
    HOLD,
    REST,
    15,
    REST,
  ])
  expect(out.tune).toEqual(['C4 E4 G4 ~ . C5', 'C3 ~ ~ ~ . .'])
  expect(bender.summary().undo).toBe(1)
})

test('an invalid tune throws and leaves the board unchanged', () => {
  expect(() => bender.tune('C4 H4')).toThrow("lane 1: 'H4' is not a note name")
  expect(() => bender.tune('C9')).toThrow('C9 is outside the range C2 to C#7')
  expect(engine.controls.get().chipTune).toBe(DEFAULT_CONTROLS.chipTune)
})

test('drums writes the named rows and leaves the others unchanged', () => {
  const kick = engine.controls.get().drumKick
  const out = bender.drums({ snare: '....x.......x...', 'open hat': 'x.?.' })
  const c = engine.controls.get()
  expect(c.drumKick).toBe(kick)
  expect(c.drumSnare).toBe(0b0000_1000_0000_1000)
  expect(c.drumOpenLen).toBe(4)
  expect(out.drums['open hat']).toBe('x.?.')
  expect(() => bender.drums({ accent: 'x?' })).toThrow(
    "the accent row accepts only 'x' and '.'",
  )
  expect(() => bender.drums({ cowbell: 'x' })).toThrow(/rows: kick, snare/)
})

test('drums writes Euclid rows, bracket ratchets and the tracker rows', () => {
  const out = bender.drums({
    kick: 'x(3,8)x(5,8)',
    hat: 'x.x.[xxx].x.',
    nudge: '....6',
    event: '............bbbb',
    'event every': '4:4',
    'snare bars': '!4:4',
  })
  const c = engine.controls.get()
  expect(out.drums.kick).toBe('x..x..x.x.xx.xx.')
  expect(c.drumRatchet4).toBe(2)
  expect(c.drumNudge4).toBe(6)
  expect(c.drumEvent12).toBe(3)
  expect(c.drumEvent11).toBe(0)
  expect(c.drumEventEvery).toBe(2)
  expect(c.drumSnareCond).toBe(9)
  expect(out.drums).toMatchObject({
    ratchet: '....3...........',
    nudge: '....6...........',
    event: '............bbbb',
    'event every': '4:4',
    'snare bars': '!4:4',
  })
  expect(() => bender.drums({ event: 'z' })).toThrow(/'z' is not a event/)
  expect(() => bender.drums({ 'kick bars': '5:4' })).toThrow(/one of 1:1/)
  expect(() => bender.drums({ hat: '[xxxxx]' })).toThrow(/a bracket holds/)
})

test('line writes the bassline memory on the kit clock and says why it is silent', () => {
  const out = bender.line('. A2 A2 | A3', { accent: '..x.', slide: '.x' })
  const c = engine.controls.get()
  expect(c).toMatchObject({
    monoSeqOn: 1,
    monoSeqLen: 4,
    monoSeqSync: 1,
    monoSeqStep0: REST,
    monoSeqStep1: -12,
    monoSeqStep3: 0,
    monoSeqStep4: REST,
    monoSeqAccentLo: 0b0010_0000_0000_0000,
    monoSeqSlideLo: 0b0100_0000_0000_0000,
  })
  expect(out).toMatchObject({
    line: '. A2 A2 A3',
    accent: '..x.',
    slide: '.x..',
    sync: 'sixteenths',
    'plays on': 'Growler',
  })
  expect(out.warnings).toEqual([
    'monoLevel is 0, so Growler is silent',
    "Growler also plays the toy's tune; set monoKeyGate: 'no, cut' to hear the line alone",
    'the kit clocks the line and is stopped; bender.play() starts both',
  ])
  expect(bender.board().line?.line).toBe('. A2 A2 A3')
  expect(bender.summary().line).toBe('stopped on Growler')

  bender.line('C3 C3', { sync: 'eighths' })
  expect(engine.controls.get()).toMatchObject({
    monoSeqSync: 2,
    monoSeqSlideLo: 0b0100_0000_0000_0000,
  })
  expect(bender.summary().undo).toBe(2)
})

test('an invalid line throws and leaves the board unchanged', () => {
  expect(() => bender.line('A2', { accent: 'xo' })).toThrow(
    "accent: 'o' is not a step; use x or .",
  )
  expect(() => bender.line('')).toThrow('the line is empty')
  expect(engine.controls.get().monoSeqOn).toBe(0)
})

test('play leaves a demo song stopped unless asked for by name', () => {
  bender.line('A2 A3')
  expect(bender.play()).toMatchObject({
    song: 'stopped',
    line: 'playing on Growler',
  })
  expect(engine.drumsPlaying.get()).toBe(true)
  bender.tune('C4 E4')
  expect(bender.play().song).toMatch(/^playing yours/)
  bender.stop()
  bender.reset()
  expect(bender.play('song').song).toMatch(/^playing lullaby/)
  bender.stop()
})

test('load finds a preset by name prefix and throws on an unknown name', () => {
  expect(bender.load('dying').loaded).toBe('dying toy')
  expect(bender.board().preset).toBe('dying toy')
  expect(() => bender.load('nope')).toThrow(/bender.presets\(\) lists all/)
})

test('listen ignores the meter message that covers audio from before the call', async () => {
  const meter = (peak: number, taps: number[], hits = 0) =>
    engine.meter.set({
      ...engine.meter.get(),
      peak,
      hits,
      taps: Float32Array.from(taps),
    })
  engine.running.set(true)
  try {
    const heard = bender.listen(150)
    setTimeout(() => meter(0.9, [0.9, 0.5], 1), 20)
    setTimeout(() => meter(0.05, [0.05, 0]), 40)
    setTimeout(() => meter(0.01, [0.0005, 0]), 60)
    expect(await heard).toMatchObject({
      peak: '-26.0 dBFS',
      sources: ['toy'],
      drumHits: [],
    })
  } finally {
    engine.running.set(false)
  }
})

test('listen before audio starts returns how to start it', async () => {
  expect(await bender.listen(100)).toEqual({
    audio:
      'suspended: click an empty area of the page, then call bender.start() again',
  })
})

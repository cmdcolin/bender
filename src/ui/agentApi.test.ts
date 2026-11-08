// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { YOURS } from '../dsp/stages/roms.ts'
import { N_BANDS } from '../dsp/util/bandMeter.ts'
import { engine } from '../engine/engine.ts'
import { BAND_ROWS, N_TAPS, packParams, SOURCE_TAPS } from '../engine/params.ts'
import { lineFor } from '../jacks.ts'
import { HOLD, REST, TUNE_LANE_KEYS } from '../tune.ts'
import { activity, ACTIVITY_LINES } from './activity.ts'
import { createBenderApi, GUIDE_MAX_CHARS } from './agentApi.ts'
import { sliderFor } from './controls/index.ts'
import { boardFromUrl } from './share.ts'
import './testDom.ts'

import type { ToWorklet } from '../engine/messages.ts'

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

test('set takes one control as a key and a value', () => {
  expect(bender.set('drumBpm', 130).applied).toEqual({ drumBpm: '130 bpm' })
  expect(engine.controls.get().drumBpm).toBe(130)
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
  for (const topic of [
    'read',
    'change',
    'music',
    'drums',
    'line',
    'lead',
    'rot',
    'hit',
    'speak',
    'clock',
    'route',
    'sound',
  ])
    expect(bender.guide(topic).length).toBeLessThanOrEqual(GUIDE_MAX_CHARS)
  expect(() => bender.guide('nope')).toThrow(
    "no guide topic 'nope'; topics: read, change, music, drums, perform, line, lead, rot, hit, speak, clock, route, tape, sound",
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

test('describe says what a bay wire does to a control it can reach', () => {
  expect(bender.describe('drumWander').wire).toMatch(/knob turned by d/)
  expect(bender.describe('drumLevel').wire).toMatch(/scales the machine/)
  expect(bender.describe('chipTone').wire).toBeUndefined()
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

test('tune says which machines play which lane, and which lanes Plinky lifts', () => {
  const set = bender.set({
    monoLevel: 1,
    monoKeyGate: 'lane 1',
    pcmLevel: 1,
    pcmKeyGate: 'lane 2',
    fmLevel: 1,
    fmMute: 'muted',
    fmKeyGate: 'lane 3',
    tuneLift: 'lanes 2 and 3',
  })
  expect(set.failed).toEqual([])
  expect(bender.tune(['A2 . E2 .', 'C4 E4', 'E5 G5 A5 G5'])).toMatchObject({
    lifted: 'lanes 2 and 3',
    'played by': { Growler: 'lane 1', Parlor: 'lane 2' },
  })
  bender.set({ pcmKeyGate: 'yes, soldered' })
  expect(bender.tune('C4')['played by']).toEqual({
    Growler: 'lane 1',
    Parlor: 'every lane',
  })
  bender.reset()
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
  bender.drums({ kick: 'x...', bpm: 131 })
  expect(engine.controls.get().drumBpm).toBe(131)
})

test('drums writes Euclid rows, bracket ratchets and the tracker rows', () => {
  const out = bender.drums({
    kick: 'x(3,8)x(5,8)',
    hat: 'x.x.[xxx].x.',
    nudge: '....6',
    retrig: '..5....9',
    event: '............bbbb',
    'event every': '4:4',
    'snare bars': '!4:4',
  })
  const c = engine.controls.get()
  expect(out.drums.kick).toBe('x..x..x.x.xx.xx.')
  expect(c.drumRatchet4).toBe(2)
  expect(c.drumNudge4).toBe(6)
  expect(c.drumRetrig2).toBe(5)
  expect(c.drumRetrig7).toBe(9)
  expect(c.drumEvent12).toBe(3)
  expect(c.drumEvent11).toBe(0)
  expect(c.drumEventEvery).toBe(2)
  expect(c.drumSnareCond).toBe(9)
  expect(out.drums).toMatchObject({
    ratchet: '....3...........',
    nudge: '....6...........',
    retrig: '..5....9........',
    event: '............bbbb',
    'event every': '4:4',
    'snare bars': '!4:4',
  })
  expect(() => bender.drums({ event: 'z' })).toThrow(/'z' is not a event/)
  expect(() => bender.drums({ retrig: '0' })).toThrow(/'0' is not a retrig/)
  expect(() => bender.drums({ 'kick bars': '5:4' })).toThrow(/one of 1:1/)
  expect(() => bender.drums({ hat: '[xxxxx]' })).toThrow(/a bracket holds/)
})

test('drums clears event every and a voice’s bars with an empty string or off', () => {
  bender.drums({
    'event every': '4:4',
    'snare bars': '!4:4',
    'kick bars': '1:2',
  })
  const out = bender.drums({
    'event every': '',
    'snare bars': 'off',
    'kick bars': ' ',
  })
  const c = engine.controls.get()
  expect(c.drumEventEvery).toBe(0)
  expect(c.drumSnareCond).toBe(0)
  expect(c.drumKickCond).toBe(0)
  expect(out.drums).not.toHaveProperty('event every')
  expect(out.drums).not.toHaveProperty('snare bars')
  expect(out.drums).not.toHaveProperty('kick bars')
})

test('drums writes ghost steps and the board reads them back', () => {
  const out = bender.drums({ snare: '....x..g.g..x..g', hat: 'g(5,8)' })
  const c = engine.controls.get()
  expect(c.drumSnare).toBe(0b0000_1000_0000_1000)
  expect(c.drumSnareGhost).toBe(0b0000_0001_0100_0001)
  expect(out.drums.snare).toBe('....x..g.g..x..g')
  expect(out.drums.hat).toBe('g.gg.gg.')
  expect(bender.board().drums).toMatchObject({ snare: '....x..g.g..x..g' })
  expect(() => bender.drums({ accent: 'xg' })).toThrow(
    "the accent row accepts only 'x' and '.'",
  )
  bender.drums({ snare: '' })
  expect(engine.controls.get().drumSnareGhost).toBe(0)
})

test('drums writes the echo row and turns a silent Wraith up for it', () => {
  bender.set({ dlyMix: 0, dlyFb: 0.2 })
  const out = bender.drums({ echo: '............x...' })
  expect(out.drums.echo).toBe('............x...')
  expect(engine.controls.get()).toMatchObject({
    drumThrow: 0b0000_0000_0000_1000,
    dlyMix: 0.7,
    dlyFb: 0.55,
  })
  bender.set({ dlyMix: 0.3 })
  bender.drums({ echo: 'x...' })
  expect(engine.controls.get()).toMatchObject({ dlyMix: 0.3, drumThrowLen: 4 })
  expect(() => bender.drums({ echo: 'x?' })).toThrow(
    "the echo row accepts only 'x' and '.'",
  )
  bender.drums({ echo: '' })
  expect(bender.board().drums).not.toHaveProperty('echo')
})

test('drums mutes rows by name, holds the fill key and reads both back', () => {
  const out = bender.drums({ mute: 'kick, Open Hat', fill: 'on' })
  const c = engine.controls.get()
  expect(c.drumRowMute).toBe(0b100_0001)
  expect(c.drumFill).toBe(1)
  expect(out.drums).toMatchObject({ mute: 'kick, open hat', fill: 'on' })
  const back = bender.drums({ mute: '', fill: 'off' })
  expect(engine.controls.get()).toMatchObject({ drumRowMute: 0, drumFill: 0 })
  expect(back.drums).not.toHaveProperty('mute')
  expect(back.drums).not.toHaveProperty('fill')
  expect(() => bender.drums({ mute: 'cowbell' })).toThrow(
    /mute takes kit voices/,
  )
  expect(() => bender.drums({ fill: 'maybe' })).toThrow('fill takes on or off')
})

test('drums gives each column a condition with step bars', () => {
  const out = bender.drums({
    'step bars': '. . . . . . . . 1:2 . . . fill fill !pre pre',
  })
  const c = engine.controls.get()
  expect(c.drumStepCond0).toBe(0)
  expect(c.drumStepCond8).toBe(1)
  expect(c.drumStepCond12).toBe(13)
  expect(c.drumStepCond14).toBe(12)
  expect(c.drumStepCond15).toBe(11)
  expect(out.drums['step bars']).toBe(
    '. . . . . . . . 1:2 . . . fill fill !pre pre',
  )
  expect(() => bender.drums({ 'step bars': 'often' })).toThrow(
    /'often' is not a step condition/,
  )
  bender.drums({ 'step bars': 'off' })
  expect(bender.board().drums).not.toHaveProperty('step bars')
  bender.drums({ 'step bars': '. . 1:2' })
  bender.drums({ 'step bars': '' })
  expect(bender.board().drums).not.toHaveProperty('step bars')
})

test('move rewrites the pattern with the panel’s moves, repeatably with a seed', () => {
  bender.drums({ kick: 'x...x...x...x...', snare: '....x.......x...' })
  const shifted = bender.move('shift')
  expect(shifted.drums.kick).toBe('.x...x...x...x..')
  bender.move('shift', { back: true })
  expect(bender.board().drums.kick).toBe('x...x...x...x...')
  const once = bender.move('new beat', { seed: 7 }).drums
  bender.drums({ kick: 'x...x...x...x...', snare: '....x.......x...' })
  expect(bender.move('New Beat', { seed: 7 }).drums).toEqual(once)
  expect(() => bender.move('explode')).toThrow(/moves: new beat, vary/)
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
    sounds: "A0 to A1, at Growler's 32′ osc 1 range",
    accent: '..x.',
    slide: '.x..',
    sync: 'sixteenths',
    'plays on': 'Growler',
  })
  expect(out.warnings).toEqual([
    'monoLevel is 0, so Growler is silent',
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

test('a line on Howler writes its own memory and leaves the bassline alone', () => {
  bender.line('A2 A2')
  const out = bender.line('. C5 ~ D#5', { on: 'Howler', accent: '.x' })
  const c = engine.controls.get()
  expect(c).toMatchObject({
    leadSeqOn: 1,
    leadSeqLen: 4,
    leadSeqSync: 1,
    leadSeqStep0: REST,
    leadSeqStep1: 15,
    leadSeqAccentLo: 0b0100_0000_0000_0000,
    monoSeqLen: 2,
    monoSeqTo: 0,
  })
  expect(out).toMatchObject({
    line: '. C5 ~ D#5',
    sounds: "C5 to D#5, at Howler's 8′ osc 1 range",
    accent: '.x..',
  })
  expect(out).not.toHaveProperty('plays on')
  expect(out.warnings).toContain('leadLevel is 0, so Howler is silent')
  expect(bender.board().lead?.line).toBe('. C5 ~ D#5')
  expect(bender.board().line?.line).toBe('A2 A2')
  expect(bender.summary().lead).toBe('stopped on Howler')
})

test('line holds an out-of-range target and sync to the ends of their range', () => {
  bender.line('A2 A2', { on: 9, sync: 99 })
  const c = engine.controls.get()
  expect(c.monoSeqTo).toBe(3)
  expect(c.monoSeqSync).toBe(sliderFor('monoSeqSync').max)
  bender.line('A2 A2', { on: -4 })
  expect(engine.controls.get().monoSeqTo).toBe(0)
})

test('the bassline aimed at Howler reports Howler and its warnings', () => {
  bender.set({ monoSeqTo: 'Howler' })
  const out = bender.line('A2 A2')
  expect(engine.controls.get().monoSeqTo).toBe(3)
  expect(out).toMatchObject({ 'plays on': 'Howler' })
  expect(out.warnings).toContain('leadLevel is 0, so Howler is silent')
  expect(bender.summary().line).toBe('stopped on Howler')
})

test('memory faults are controls, and the damage reads back until restore', () => {
  const posted: ToWorklet[] = []
  Object.assign(engine, {
    node: { port: { postMessage: (m: ToWorklet) => posted.push(m) } },
  })
  const was = engine.meter.get()
  try {
    bender.set({
      monoSeqLeak: 0.3,
      leadSeqRot: 'every bar',
      monoSeqDataLine: 'D6 accent',
    })
    expect(engine.controls.get()).toMatchObject({
      monoSeqLeak: 0.3,
      leadSeqRot: 6,
      monoSeqDataLine: 7,
    })
    bender.line('A2 A2')
    expect(posted).toContainEqual({ kind: 'lineRestore', card: 'mono' })
    expect(bender.board().line).not.toHaveProperty('ram')

    const ram = new Float32Array(32).fill(REST)
    ram[0] = -12
    ram[1] = -11
    const flags = new Uint8Array(32)
    flags[1] = 1
    engine.meter.set({
      ...was,
      monoSeqRam: ram,
      monoSeqFlags: flags,
      monoSeqDamage: 0b10,
    })
    expect(bender.board().line?.ram).toEqual({
      line: 'A2 A#2',
      accent: '.x',
      slide: '..',
    })
    expect(bender.restore()).toMatchObject({ line: 'A2 A2' })
    expect(posted.at(-1)).toEqual({ kind: 'lineRestore', card: 'mono' })
    bender.restore('Howler')
    expect(posted.at(-1)).toEqual({ kind: 'lineRestore', card: 'lead' })
  } finally {
    engine.meter.set(was)
  }
})

test('an invalid line throws and leaves the board unchanged', () => {
  expect(() => bender.line('A2', { accent: 'xo' })).toThrow(
    "accent: 'o' is not a step; use x or .",
  )
  expect(() => bender.line('')).toThrow('the line is empty')
  expect(() => bender.line('A1')).toThrow(/so A3 sounds A1/)
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
  expect(bender.play('song').song).toMatch(/^playing arp/)
  bender.stop()
})

test('load finds a preset by name prefix and throws on an unknown name', () => {
  expect(bender.load('dying').loaded).toBe('dying toy')
  expect(bender.board().preset).toBe('dying toy')
  expect(() => bender.load('nope')).toThrow(/bender.presets\(\) lists all/)
})

test('listen names a length that is not a number', async () => {
  await expect(bender.listen('abc')).rejects.toThrow(
    /listen takes milliseconds, as listen\(1500\); 'abc' is not a number/,
  )
})

test('listen says a burst of meters is a backlog from a lagging page', async () => {
  engine.running.set(true)
  try {
    const heard = bender.listen(150)
    setTimeout(() => {
      for (let i = 0; i < 60; i++) engine.meter.set({ ...engine.meter.get() })
    }, 20)
    expect((await heard).meters).toMatch(/more than due, so the page lagged/)
  } finally {
    engine.running.set(false)
  }
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
      sources: ['Plinky'],
      sourcePeaks: { Plinky: '-26.0 dBFS' },
      drumHits: [],
    })
  } finally {
    engine.running.set(false)
  }
})

test('listen names the notes of each machine it heard, Parlor included', async () => {
  const taps = new Float32Array(16)
  taps[3] = 0.5
  engine.running.set(true)
  try {
    const heard = bender.listen(150)
    setTimeout(() => engine.meter.set({ ...engine.meter.get() }), 20)
    setTimeout(() => {
      engine.pcmNotes.set(new Set([0, 4]))
      engine.fmNotes.set(new Set([7]))
      engine.meter.set({ ...engine.meter.get(), taps })
    }, 40)
    expect(await heard).toMatchObject({
      sources: ['Parlor'],
      notes: { Parlor: ['A3', 'C#4'] },
    })
  } finally {
    engine.pcmNotes.set(new Set())
    engine.fmNotes.set(new Set())
    engine.running.set(false)
  }
})

test('listen splits the bands for its window and names a lead the rest buries', async () => {
  const watch = vi.spyOn(engine, 'watchBands')
  const noise = SOURCE_TAPS.indexOf('noise')
  const lead = SOURCE_TAPS.indexOf('leadSynth')
  const taps = new Float32Array(N_TAPS)
  taps[noise] = 0.5
  taps[lead] = 0.05
  const bands = new Float32Array(BAND_ROWS * N_BANDS)
  bands.fill(0.2, noise * N_BANDS, (noise + 1) * N_BANDS)
  bands[lead * N_BANDS + 5] = 0.05
  engine.running.set(true)
  try {
    const heard = bender.listen(150)
    expect(watch).toHaveBeenLastCalledWith(true)
    setTimeout(() => engine.meter.set({ ...engine.meter.get() }), 20)
    setTimeout(() => {
      engine.leadNotes.set(new Set([12]))
      engine.meter.set({ ...engine.meter.get(), taps, bands })
    }, 40)
    expect(await heard).toMatchObject({
      sources: ['Noise & crackle', 'Howler'],
      bands: { Howler: { mid: -26 }, 'Noise & crackle': { mid: -11 } },
      owners: { mid: { 'Noise & crackle': 0.97 } },
      masked: { Howler: { share: 1, by: 'Noise & crackle', band: 'mid' } },
    })
    expect(watch).toHaveBeenLastCalledWith(false)
  } finally {
    engine.leadNotes.set(new Set())
    engine.running.set(false)
    watch.mockRestore()
  }
})

test('a listen while the meter tiles are up leaves the bands on for them', async () => {
  const posted: ToWorklet[] = []
  Object.assign(engine, {
    node: { port: { postMessage: (m: ToWorklet) => posted.push(m) } },
  })
  const bands = () => posted.filter(m => m.kind === 'bands').map(m => m.on)
  engine.running.set(true)
  engine.watchBands(true)
  try {
    await bender.listen(100)
    expect(bands()).toEqual([true, true, true])
  } finally {
    engine.watchBands(false)
    engine.running.set(false)
  }
  expect(bands().at(-1)).toBe(false)
})

test('listen before audio starts returns how to start it', async () => {
  expect(await bender.listen(100)).toEqual({
    audio:
      'suspended: click an empty area of the page, then call bender.start() again',
  })
})

const atTick = (tick: number, cued = engine.meter.get().cued) =>
  engine.meter.set({ ...engine.meter.get(), tick, cued, drumStepMs: 125 })

async function onTheClock(run: (posted: ToWorklet[]) => void | Promise<void>) {
  const posted: ToWorklet[] = []
  Object.assign(engine, {
    node: { port: { postMessage: (m: ToWorklet) => posted.push(m) } },
  })
  engine.running.set(true)
  engine.setDrumsPlaying(true)
  try {
    await run(posted)
  } finally {
    engine.uncue()
    engine.setDrumsPlaying(false)
    engine.running.set(false)
    atTick(0, 0)
  }
}

test('hit strikes the sheet, the bottle and kit voices, and warns at level 0', () => {
  const posted: ToWorklet[] = []
  Object.assign(engine, {
    node: { port: { postMessage: (m: ToWorklet) => posted.push(m) } },
  })
  engine.running.set(true)
  try {
    bender.set({ sheetLevel: 0, bottleLevel: 0.5, drumLevel: 0.7 })
    expect(bender.hit(['sheet', 'Open Hat'], { x: 2, gain: 0.5 })).toEqual({
      hit: ['sheet', 'openhat'],
      warnings: ['sheetLevel is 0, so Sheet is silent'],
    })
    expect(bender.hit('bottle').warnings).toEqual([])
    expect(posted).toEqual(
      expect.arrayContaining([
        { kind: 'struckHit', target: 'sheet', x: 1, y: 0.5, gain: 0.5 },
        { kind: 'drumHit', bits: 1 << 6, gain: 0.5 },
        { kind: 'struckHit', target: 'bottle', x: 0.5, y: 0.7, gain: 1 },
      ]),
    )
    expect(() => bender.hit('gong')).toThrow(/sheet, bottle or a kit voice/)
  } finally {
    engine.running.set(false)
  }
})

test('speak loads the phrase, brings Prattle up and says it', () => {
  const posted: ToWorklet[] = []
  Object.assign(engine, {
    node: { port: { postMessage: (m: ToWorklet) => posted.push(m) } },
  })
  engine.running.set(true)
  try {
    bender.set({ talkLevel: 0 })
    expect(bender.speak('kill the bass', { struck: 'Open Hat' })).toEqual({
      phrase: 'kill the bass',
      warnings: [],
    })
    const c = engine.controls.get()
    expect(c.talkLevel).toBe(0.8)
    expect(c.talkStruck).toBe(7)
    expect(posted).toContainEqual({ kind: 'talk' })
    expect(() => bender.speak('hi', { struck: 'gong' })).toThrow(/kit voice/)
  } finally {
    engine.running.set(false)
  }
})

test('a hit inside a queue waits for the queue to land', async () => {
  const posted: ToWorklet[] = []
  Object.assign(engine, {
    node: { port: { postMessage: (m: ToWorklet) => posted.push(m) } },
  })
  let inside: unknown
  const landing = bender.queue(() => {
    inside = bender.hit('sheet')
  })
  const lands: unknown = expect.stringMatching(/queue lands/)
  expect(inside).toMatchObject({ lands })
  expect(posted.some(m => m.kind === 'struckHit')).toBe(false)
  await landing
  expect(posted.some(m => m.kind === 'struckHit')).toBe(true)
})

test('position reads bar, beat and step off the kit’s counter', () => {
  atTick(37)
  expect(bender.position()).toEqual({
    bar: 2,
    beat: 1,
    step: 5,
    bpm: 120,
    kit: 'stopped: bender.play() starts the counter',
    waiting: [],
  })
  atTick(0)
})

test('next resolves on the first meter past the next downbeat of its run', async () => {
  await onTheClock(async () => {
    atTick(20)
    let bar: number | undefined
    const next = bender.next().then(p => (bar = p.bar))
    atTick(31)
    await Promise.resolve()
    expect(bar).toBeUndefined()
    atTick(32)
    expect(await next).toBe(2)
    const four = bender.next(4)
    atTick(48)
    atTick(64)
    expect((await four).bar).toBe(4)
    const beat = bender.next('beat')
    atTick(68)
    expect((await beat).beat).toBe(1)
    const stopped = bender.next()
    engine.setDrumsPlaying(false)
    await expect(stopped).rejects.toThrow('the kit stopped before the downbeat')
  })
  expect(() => bender.next()).toThrow(/^the kit is stopped/)
  expect(() => bender.next(0)).toThrow(/is not a count of bars/)
})

test('queue lands the writes made inside it on the next bar, through the worklet', async () => {
  await onTheClock(async posted => {
    atTick(5)
    const landed = bender.queue(() => {
      bender.drums({ kick: 'x...x...x...x...' })
      bender.move('shift')
      bender.set({ dlyFb: 0.9 })
    })
    expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
    expect(bender.position().waiting).toEqual(['bar 1'])
    const cue = posted.findLast(m => m.kind === 'cue')
    expect(cue).toMatchObject({ at: 16 })
    atTick(16, cue?.id)
    expect(await landed).toMatchObject({
      landed: 'on bar 1',
      bar: 1,
      step: 0,
      waiting: [],
    })
    expect(engine.controls.get().dlyFb).toBe(0.9)
    expect(bender.board().drums.kick).toBe('.x...x...x...x..')
  })
})

test('queue aims at a named bar or a run of bars, and refuses one already begun', async () => {
  await onTheClock(() => {
    atTick(40)
    void bender.queue(() => bender.set({ dlyFb: 0.9 }), 4)
    void bender.queue(() => bender.set({ dlyFb: 0.2 }), { bar: 9 })
    expect(bender.position().waiting).toEqual(['bar 4', 'bar 9'])
    expect(() =>
      bender.queue(() => bender.set({ dlyFb: 0.5 }), { bar: 2 }),
    ).toThrow('bar 2 has begun or passed; the counter is on bar 2')
    expect(() =>
      bender.queue(() => {
        bender.set({ dlyFb: 0.5 })
        return Promise.resolve()
      }),
    ).toThrow(/writes after an await are not queued/)
    expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
    expect(bender.unqueue()).toEqual({ dropped: 2 })
  })
})

test('next and queue settle when the audio suspends', async () => {
  await onTheClock(async () => {
    atTick(5)
    const next = bender.next()
    const landed = bender.queue(() => bender.set({ dlyFb: 0.3 }))
    engine.running.set(false)
    await expect(next).rejects.toThrow(/^the audio stopped before the downbeat/)
    expect((await landed).landed).toBe('on bar 0')
    expect(engine.controls.get().dlyFb).toBe(0.3)
  })
})

test('queue lands at once while the kit is stopped, and unqueue drops what waits', async () => {
  expect(await bender.queue(() => bender.set({ dlyFb: 0.9 }))).toMatchObject({
    landed: 'at once, as the kit is not running',
  })
  expect(engine.controls.get().dlyFb).toBe(0.9)
  await onTheClock(async () => {
    atTick(5)
    const dropped = bender.queue(() => bender.set({ dlyFb: 0.2 }))
    bender.unqueue()
    expect((await dropped).landed).toBe('dropped by unqueue')
    expect(engine.controls.get().dlyFb).toBe(0.9)
  })
})

const recent = (count: number) =>
  activity
    .get()
    .lines.slice(0, count)
    .map(line => line.text)
    .toReversed()

test('each call that changes the board records a line with its display values', () => {
  bender.set({ chipStarve: 0.2, tapeSpeed: '1⅞' }, 6)
  bender.set('drumBpm', 130)
  bender.load('dying toy', 2)
  bender.reset()
  bender.undo()
  bender.redo()
  bender.tune(['C4 E4 G4 ~ . C5 D#5 . G4 . . C5 E5 G5', 'C3'])
  bender.drums({ kick: 'x...x...', snare: '', bpm: 96 })
  bender.line('. . C5 ~ D#5', { on: 'Glint', accent: 'x...' })
  bender.play('drums')
  bender.stop()
  expect(recent(11)).toEqual([
    'set chipStarve 0.20, tapeSpeed 1⅞ ips  (glide 6s)',
    'set drumBpm 130 bpm',
    'load dying toy  (glide 2s)',
    'reset',
    'undo',
    'redo',
    'tune C4 E4 G4 ~ . C5 D#5 . G4 . . C5…',
    'drums kick x...x..., snare —, bpm 96',
    'line . . C5 ~ D#5, on Glint, accent x...',
    'play drums',
    'stop',
  ])
})

test('reading the board, and calls that fail or change nothing, record nothing', () => {
  bender.set('chipStarve', 0.3)
  const before = activity.get().lines
  bender.summary()
  bender.board()
  bender.find('delay')
  bender.describe('chipStarve')
  bender.guide('read')
  bender.presets()
  bender.link()
  bender.set({ nothing: 1 })
  expect(() => bender.tune('Q9')).toThrow()
  expect(() => bender.load('nope')).toThrow()
  expect(activity.get().lines).toBe(before)
})

test('say heads the record and marks its line', () => {
  expect(bender.say('  breath in the lead ')).toBe('breath in the lead')
  bender.set('chipStarve', 0.4)
  expect(activity.get().headline).toBe('breath in the lead')
  expect(activity.get().lines.slice(0, 2)).toMatchObject([
    { text: 'set chipStarve 0.40', said: false },
    { text: 'breath in the lead', said: true },
  ])
})

test('the record keeps only its newest lines', () => {
  for (let i = 0; i < ACTIVITY_LINES + 5; i++) bender.set('drumBpm', 100 + i)
  expect(activity.get().lines).toHaveLength(ACTIVITY_LINES)
  expect(activity.get().lines[0]!.text).toBe(
    `set drumBpm ${100 + ACTIVITY_LINES + 4} bpm`,
  )
})

test('a call repeated at once counts up on one line', () => {
  bender.hit('sheet')
  bender.hit('sheet')
  bender.hit('sheet')
  expect(activity.get().lines[0]).toMatchObject({
    text: 'hit sheet',
    times: 3,
  })
  expect(activity.get().lines[1]!.text).not.toBe('hit sheet')
})

test('queue records a line above the writes it holds', async () => {
  await bender.queue(() => bender.set({ dlyFb: 0.4 }), 4)
  expect(recent(2)).toEqual([
    'set dlyFb 0.40',
    'queue the writes below for the next bar of 4',
  ])
})

test('route puts effects on sets of machines and reads back each unit and machine', () => {
  bender.reset()
  bender.set({ echoLevel: 0.6, revMix: 0.5, crushMix: 0.4 })
  const back = bender.route({
    ricochet: ['Clatter', 'Plinky'],
    Boing: ['clatter', 'plinky', 'sheet'],
    Crusher: 'Clatter',
  })
  expect(engine.controls.get()).toMatchObject({
    echoLines: lineFor('toyDrum', 'toyChip'),
    revLines: lineFor('toyDrum', 'toyChip', 'sheet'),
    crushLines: lineFor('toyDrum'),
  })
  expect(back.units.Crusher).toMatchObject({
    lines: 'Clatter',
    order: 1,
    bypassed: false,
    mix: '0.40',
  })
  expect(back.units.Ricochet).toMatchObject({
    lines: 'Plinky + Clatter',
    order: 2,
  })
  expect(back.units.Boing).toMatchObject({
    lines: 'Plinky + Clatter + Sheet',
    order: 3,
  })
  expect(back.units.Gnash?.lines).toBe('master')
  expect(back.machines).toEqual({
    Clatter: {
      own: ['Crusher'],
      shared: [
        'Ricochet on Plinky + Clatter',
        'Boing on Plinky + Clatter + Sheet',
      ],
    },
    Plinky: {
      own: [],
      shared: [
        'Ricochet on Plinky + Clatter',
        'Boing on Plinky + Clatter + Sheet',
      ],
    },
    Sheet: { own: [], shared: ['Boing on Plinky + Clatter + Sheet'] },
  })
  expect(
    bender.route({ Boing: 'master', Ricochet: [] }).units.Boing,
  ).toMatchObject({
    lines: 'master',
  })
  expect(engine.controls.get().echoLines).toBe(0)
})

test('route throws on an unknown effect or machine, and changes nothing', () => {
  bender.reset()
  expect(() => bender.route({ Reverb: ['Sheet'] })).toThrow(
    /^no effect named 'Reverb'; the effects are Ring mod, /,
  )
  expect(() => bender.route({ Boing: ['Sheat'] })).toThrow(
    /^no machine matches 'sheat'; the lines are master, Mic, Plinky/,
  )
  expect(() => bender.route({ Boing: ['P'] })).toThrow(
    /'p' matches Plinky and Parlor and Prattle/,
  )
  expect(engine.controls.get().revLines).toBe(0)
})

test('set still takes the Into keys and a plus between machines', () => {
  bender.reset()
  expect(bender.set({ echoInto: 'clatter' }).applied).toEqual({
    echoLines: 'Clatter',
  })
  expect(bender.set({ revInto: 14 }).applied).toEqual({ revLines: 'Prattle' })
  expect(bender.set({ ampLines: 'Clatter+Plinky' }).applied).toEqual({
    ampLines: 'Plinky + Clatter',
  })
  expect(engine.controls.get().ampLines).toBe(lineFor('toyDrum', 'toyChip'))
})

test('route reports a unit heard while its return is over the floor', () => {
  bender.reset()
  bender.route({ Boing: ['Sheet'] })
  const was = engine.meter.get()
  const returns = new Float32Array(was.returns.length)
  returns[13] = 0.2
  engine.meter.set({ ...was, returns })
  expect(bender.route().units.Boing!.heard).toBe(true)
  expect(bender.route().units.Gnash!.heard).toBe(false)
  engine.meter.set(was)
})

test('heard reads back what the audio thread plays and what each wire pushes', async () => {
  bender.reset()
  bender.set({ chipStarve: 0.2, mod0Src: 'lfo', mod0Dest: 'filt cut' })
  const playing = packParams({ ...engine.controls.get(), chipStarve: 0.6 })
  const probe = vi.spyOn(engine, 'probe').mockResolvedValue({
    kind: 'probed',
    id: 1,
    heard: playing,
    wires: Float32Array.of(0.25, Number.NaN, Number.NaN, Number.NaN),
  })
  engine.running.set(true)
  try {
    expect(await bender.heard()).toEqual({
      moved: ['chipStarve = 0.60  (written 0.20)'],
      wires: [
        expect.stringMatching(/^wire 1: .* into filt cut, pushing 0\.25$/),
      ],
    })
  } finally {
    engine.running.set(false)
    probe.mockRestore()
    bender.reset()
  }
})

test('tape rolls a shelf by name, searches other words and lists the shelves', async () => {
  const roll = vi.spyOn(engine, 'rollSample').mockResolvedValue()
  const search = vi.spyOn(engine, 'searchArchive').mockResolvedValue([])
  try {
    await bender.tape('numbers stations')
    expect(roll.mock.calls[0]?.[0].id).toBe('numbers')
    expect(await bender.tape('moon landing')).toMatchObject({
      problem: 'nothing on archive.org for moon landing',
    })
    expect(search).toHaveBeenCalledWith('moon landing')
    expect((await bender.tape()).shelves).toContain('78s')
  } finally {
    roll.mockRestore()
    search.mockRestore()
  }
})

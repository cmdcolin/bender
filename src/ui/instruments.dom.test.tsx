// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'

import { DEFAULT_CONTROLS, sameControls } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { bench, parseBench } from './bench.ts'
import { GROUPS } from './controls/index.ts'
import { shownOn } from './fitted.ts'
import { Instruments } from './Instruments.tsx'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

beforeEach(() => {
  localStorage.clear()
  bench.set({
    instruments: [],
    closed: [],
    pedals: [],
    roll: false,
    grid: false,
  })
})

const machine = (name: string) => screen.getByRole('group', { name })
const group = (name: string) => screen.queryByRole('group', { name })
const addInstrument = () =>
  screen.getByRole('button', { name: /^Add instrument/ })
const addAll = () => {
  fireEvent.click(addInstrument())
  for (let item; (item = screen.queryAllByRole('menuitem')[0]);)
    fireEvent.click(item)
}
const putAway = (stage: string) =>
  fireEvent.click(screen.getByRole('button', { name: `put away ${stage}` }))

test('the toy and the kit show alone while the other three have no level', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(group('plinky')).not.toBeNull()
  expect(group('clatter')).not.toBeNull()
  expect(group('glint')).toBeNull()
  expect(group('parlor')).toBeNull()
  expect(group('growler')).toBeNull()
  expect(screen.getAllByRole('button', { name: /^put away / })).toHaveLength(2)
})

test('putting away the toy keyboard hides it and Add instrument brings it back', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  putAway('Plinky')
  expect(group('plinky')).toBeNull()
  fireEvent.click(addInstrument())
  fireEvent.click(screen.getByRole('menuitem', { name: /^Plinky/ }))
  expect(group('plinky')).not.toBeNull()
})

test('every machine added has a ⋯ menu', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  addAll()
  for (const name of ['plinky', 'clatter', 'glint', 'parlor', 'growler'])
    expect(group(name)).not.toBeNull()
  expect(screen.getByRole('region', { name: 'spool' })).toBeTruthy()
  expect(screen.getByRole('region', { name: 'layercake' })).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^more for / })).toHaveLength(7)
})

test('Add instrument names each machine with what it is and lays out the pick', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(addInstrument())
  expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(
    [
      'Glint (FM synth)',
      'Parlor (home keyboard)',
      'Growler (mono synth)',
      'Spool (tape loop)',
      'Layercake (four-track)',
    ],
  )
  fireEvent.click(screen.getByRole('menuitem', { name: /^Glint/ }))
  expect(group('glint')).not.toBeNull()
  expect(bench.get().instruments).toEqual(['Glint'])
  expect(screen.queryByRole('menuitem', { name: /^Glint/ })).toBeNull()
})

test('adding a machine with its level down brings the level up to sound', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(engine.controls.get().monoLevel).toBe(0)
  fireEvent.click(addInstrument())
  fireEvent.click(screen.getByRole('menuitem', { name: /^Growler/ }))
  expect(engine.controls.get().monoLevel).toBe(0.6)
  expect(
    screen
      .getByRole('button', { name: 'volume Growler' })
      .getAttribute('aria-expanded'),
  ).toBe('false')
})

test('closing a machine hides it and the menu offers it again', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  addAll()
  expect(screen.queryByRole('button', { name: /^Add instrument/ })).toBeNull()
  putAway('Glint')
  expect(group('glint')).toBeNull()
  fireEvent.click(addInstrument())
  expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(
    ['Glint (FM synth)'],
  )
})

test('randomize rolls that machine and leaves the others where they were', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  addAll()
  const roll = screen.getAllByRole('button', { name: 'randomize' })
  expect(roll).toHaveLength(7)
  const before = engine.controls.get()
  fireEvent.click(roll[0]!)
  const now = engine.controls.get()
  expect(sameControls(now, before)).toBe(false)
  expect(now.drumLevel).toBe(before.drumLevel)
  expect(now.fmLevel).toBe(before.fmLevel)
})

test('the ⋯ menu picks a kind of roll, rolls it and keeps it on the face', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  addAll()
  fireEvent.click(screen.getByRole('button', { name: 'more for Clatter' }))
  const names = screen
    .getAllByRole('menuitem')
    .map(item => item.textContent ?? '')
  expect(names).toEqual([
    'sound',
    'nudge',
    'faults',
    'play',
    'pattern',
    'everything',
    'undo',
  ])
  fireEvent.click(screen.getByRole('menuitem', { name: 'pattern' }))
  expect(
    screen.getAllByRole('button', { name: 'pattern' }).length,
  ).toBeGreaterThan(0)
  expect(screen.queryByRole('menuitem')).toBeNull()
  expect(engine.controls.get().drumLevel).toBe(DEFAULT_CONTROLS.drumLevel)
})

test('undo in the roll menu puts the stage back', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  addAll()
  const before = engine.controls.get()
  fireEvent.click(
    within(machine('glint')).getByRole('button', { name: 'randomize' }),
  )
  expect(sameControls(engine.controls.get(), before)).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'more for Glint' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'undo' }))
  expect(sameControls(engine.controls.get(), before)).toBe(true)
})

test('the speaker opens a volume popover whose mute keeps the level, and a roll leaves it muted', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  addAll()
  const speaker = screen.getByRole('button', { name: 'volume Clatter' })
  expect(speaker.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(speaker)
  expect(speaker.getAttribute('aria-expanded')).toBe('true')
  const mute = screen.getByRole('checkbox', { name: 'mute' })
  expect(mute).toHaveProperty('checked', false)
  fireEvent.click(mute)
  expect(engine.controls.get().drumMute).toBe(1)
  expect(engine.controls.get().drumLevel).toBe(DEFAULT_CONTROLS.drumLevel)
  expect(mute).toHaveProperty('checked', true)
  fireEvent.click(
    within(machine('clatter')).getByRole('button', { name: 'randomize' }),
  )
  expect(engine.controls.get().drumMute).toBe(1)
  fireEvent.click(mute)
  expect(engine.controls.get().drumMute).toBe(0)
})

test('the popover slider moves the Level, and zero lights the speaker and the mute box', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  addAll()
  fireEvent.click(screen.getByRole('button', { name: 'volume Clatter' }))
  const popover = screen.getByRole('group', { name: 'Clatter volume' })
  const level = within(popover).getByRole('slider', { name: 'Level' })
  fireEvent.change(level, { target: { value: '400' } })
  const up = engine.controls.get().drumLevel
  expect(up).not.toBe(DEFAULT_CONTROLS.drumLevel)
  fireEvent.change(level, { target: { value: '0' } })
  expect(engine.controls.get().drumLevel).toBe(0)
  expect(engine.controls.get().drumMute).toBe(0)
  const mute = within(popover).getByRole('checkbox', { name: 'mute' })
  expect(mute).toHaveProperty('checked', true)
  fireEvent.click(mute)
  expect(engine.controls.get().drumLevel).toBe(up)
  expect(mute).toHaveProperty('checked', false)
})

test('only the machines with no speaker cap keep a Level slider on the face', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  addAll()
  expect(screen.getAllByRole('slider', { name: 'Level' })).toHaveLength(2)
  expect(
    within(machine('clatter')).queryByRole('slider', { name: 'Level' }),
  ).toBeNull()
})

test('every machine on the shared rail shows the rail lamp', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  addAll()
  for (const name of ['plinky', 'clatter', 'glint', 'parlor', 'growler'])
    expect(within(group(name)!).getByText('4.50 V')).toBeTruthy()
})

test('a machine pulled down to no level stays on the bench', () => {
  engine.set('fmLevel', 0.5)
  render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(group('glint')).not.toBeNull()
  act(() => engine.set('fmLevel', 0))
  expect(group('glint')).not.toBeNull()
})

test('no pedal sits on the bench until it is added from the menu', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(group('gnash')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^Add pedal/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^Gnash/ }))
  expect(group('gnash')).not.toBeNull()
  expect(group('ember')).toBeNull()
})

test('Add pedal names each pedal with what it is, benches the pick and brings its mix up', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /^Add pedal/ }))
  expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(
    [
      'Gnash (stompbox)',
      'Wraith (tape delay)',
      'Ricochet (delay pedal)',
      'Boing (spring reverb)',
      'Chorale (ensemble)',
      'Ember (tube amp)',
    ],
  )
  fireEvent.click(screen.getByRole('menuitem', { name: /^Ember/ }))
  expect(bench.get().pedals).toEqual(['Ember'])
  expect(group('ember')).not.toBeNull()
  expect(shownOn(engine.controls.get()).has('Ember')).toBe(true)
  expect(engine.controls.get().ampMix).toBe(0.5)
  expect(screen.queryByRole('menuitem', { name: /^Ember/ })).toBeNull()
})

test('a pedal face bypasses its pedal, opens its panel and puts itself away', () => {
  const opened: string[] = []
  bench.set({
    instruments: [],
    closed: [],
    pedals: ['Boing'],
    roll: false,
    grid: false,
  })
  render(<Instruments seconds={0} onOpen={s => opened.push(s)} />)
  expect(screen.getAllByRole('slider').length).toBeGreaterThan(2)
  const bypass = screen.getByRole('button', { name: 'bypass Boing' })
  fireEvent.click(bypass)
  expect(engine.controls.get().revMute).toBe(1)
  expect(bypass.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(bypass)
  expect(engine.controls.get().revMute).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'all controls' }))
  expect(opened).toEqual(['Boing'])
  putAway('Boing')
  expect(group('boing')).toBeNull()
  expect(bench.get().pedals).toEqual([])
})

test('a pedal slider moves its own control and goes back to stock on a double press', () => {
  bench.set({
    instruments: [],
    closed: [],
    pedals: ['Boing'],
    roll: false,
    grid: false,
  })
  render(<Instruments seconds={0} onOpen={() => {}} />)
  const mix = screen.getByRole('slider', { name: 'Reverb level' })
  fireEvent.change(mix, { target: { value: '1000' } })
  expect(engine.controls.get().revMix).toBe(1)
  expect(engine.controls.get().revDecayS).toBe(DEFAULT_CONTROLS.revDecayS)
  fireEvent.doubleClick(screen.getByText('Reverb level'))
  expect(engine.controls.get().revMix).toBe(DEFAULT_CONTROLS.revMix)
})

test('a pedal selector switch goes to the next position on each press', () => {
  bench.set({
    instruments: [],
    closed: [],
    pedals: ['Gnash'],
    roll: false,
    grid: false,
  })
  render(<Instruments seconds={0} onOpen={() => {}} />)
  const before = engine.controls.get().stompCircuit
  fireEvent.click(screen.getByRole('button', { name: /^Circuit: / }))
  expect(engine.controls.get().stompCircuit).toBe(before + 1)
})

test('the stage panel of a pedal puts it on the bench and takes it off', () => {
  const verb = GROUPS.find(g => g.name === 'Boing')!
  render(<OpenGroup group={verb} onClose={() => {}} seconds={0} />)
  const toggle = screen.getByRole('button', { name: 'bench' })
  fireEvent.click(toggle)
  expect(bench.get().pedals).toEqual(['Boing'])
  expect(toggle.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(toggle)
  expect(bench.get().pedals).toEqual([])
})

test('the mic stage panel opens the mic from its header', () => {
  const mic = GROUPS.find(g => g.name === 'Mic')!
  render(<OpenGroup group={mic} onClose={() => {}} seconds={0} />)
  const toggle = screen.getByRole('button', { name: 'open mic' })
  expect(toggle.getAttribute('aria-pressed')).toBe('false')
  act(() => engine.micOn.set(true))
  expect(toggle.getAttribute('aria-pressed')).toBe('true')
  act(() => engine.micOn.set(false))
})

test('the tape loop face comes up while the mic is open', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  const tape = () => screen.queryByRole('region', { name: 'spool' })
  expect(tape()).toBeNull()
  act(() => engine.micOn.set(true))
  expect(tape()).not.toBeNull()
  act(() => engine.micOn.set(false))
  expect(tape()).toBeNull()
})

test('an instrument stage panel has no bench toggle', () => {
  const toy = GROUPS.find(g => g.name === 'Plinky')!
  render(<OpenGroup group={toy} onClose={() => {}} seconds={0} />)
  expect(screen.queryByRole('button', { name: 'bench' })).toBeNull()
})

test('the instruments brought up are stored for the next load', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(addInstrument())
  fireEvent.click(screen.getByRole('menuitem', { name: /^Glint/ }))
  expect(parseBench(localStorage.getItem('bender.bench'))).toEqual({
    instruments: ['Glint'],
    closed: [],
    pedals: [],
    roll: false,
    grid: false,
  })
})

test('a stored bench that is not one reads as the default', () => {
  const stock = {
    instruments: [],
    closed: [],
    pedals: [],
    roll: false,
    grid: false,
  }
  expect(parseBench('{')).toEqual(stock)
  expect(parseBench('7')).toEqual(stock)
  expect(
    parseBench('{"instruments":["Glint",3],"pedals":["Ember",1]}'),
  ).toEqual({
    instruments: ['Glint'],
    closed: [],
    pedals: ['Ember'],
    roll: false,
    grid: false,
  })
  expect(parseBench('{"instruments":[]}').pedals).toEqual([])
})

test('a machine added from the menu has its box on the map', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(shownOn(engine.controls.get()).has('Growler')).toBe(false)
  addAll()
  expect(shownOn(engine.controls.get()).has('Growler')).toBe(true)
})

test('the piano roll stays out of the listed toy keyboard panel until it is shown', () => {
  const toy = GROUPS.find(g => g.name === 'Plinky')!
  render(<OpenGroup group={toy} onClose={() => {}} seconds={0} />)
  fireEvent.click(screen.getByRole('button', { name: 'all settings' }))
  expect(screen.queryByRole('application', { name: /roll/i })).toBeNull()
  const before = document.body.innerHTML
  const toggle = screen.getByRole('button', { name: 'show piano roll' })
  fireEvent.click(toggle)
  expect(bench.get().roll).toBe(true)
  expect(bench.get().grid).toBe(false)
  expect(toggle.getAttribute('aria-pressed')).toBe('true')
  expect(document.body.innerHTML).not.toBe(before)
  fireEvent.click(toggle)
  expect(bench.get().roll).toBe(false)
  expect(document.body.innerHTML).toBe(before)
})

test('the drum grid stays out of the toy drums panel until it is shown', () => {
  const kit = GROUPS.find(g => g.name === 'Clatter')!
  render(<OpenGroup group={kit} onClose={() => {}} seconds={0} />)
  const before = document.body.innerHTML
  fireEvent.click(screen.getByRole('button', { name: 'show drum pattern' }))
  expect(bench.get().grid).toBe(true)
  expect(bench.get().roll).toBe(false)
  expect(document.body.innerHTML).not.toBe(before)
})

test('the kit’s miniature pattern shows the grid it opens', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'edit the drum pattern' }))
  expect(bench.get().grid).toBe(true)
})

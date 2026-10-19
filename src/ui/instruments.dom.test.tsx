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
  bench.set({ all: false, closed: [], pedals: [], roll: false, grid: false })
})

const group = (name: string) => screen.queryByRole('group', { name })
const allMode = () => screen.getByRole('button', { name: / instruments$/ })

test('the toy and the kit show alone while the other three have no level', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(group('toy keyboard')).not.toBeNull()
  expect(group('toy drums')).not.toBeNull()
  expect(group('fm keyboard')).toBeNull()
  expect(group('home keyboard')).toBeNull()
  expect(group('mono synth')).toBeNull()
  expect(screen.queryByRole('button', { name: /^close / })).toBeNull()
})

test('all-instruments lays out every machine, each with a close cap', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allMode())
  for (const name of [
    'toy keyboard',
    'toy drums',
    'fm keyboard',
    'home keyboard',
    'mono synth',
  ])
    expect(group(name)).not.toBeNull()
  expect(screen.getAllByRole('button', { name: /^close / })).toHaveLength(5)
})

test('add all instruments reopens closed machines, then hides the unused ones', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(allMode().textContent).toBe('+ add all instruments')
  fireEvent.click(allMode())
  fireEvent.click(screen.getByRole('button', { name: 'close FM chip' }))
  expect(allMode().textContent).toBe('+ add all instruments')
  fireEvent.click(allMode())
  expect(group('fm keyboard')).not.toBeNull()
  expect(allMode().textContent).toBe('− hide unused instruments')
  fireEvent.click(allMode())
  expect(group('fm keyboard')).toBeNull()
  expect(group('toy keyboard')).not.toBeNull()
})

test('closing a machine hides it and a chip brings it back', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allMode())
  fireEvent.click(screen.getByRole('button', { name: 'close FM chip' }))
  expect(group('fm keyboard')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '+ fm chip' }))
  expect(group('fm keyboard')).not.toBeNull()
})

test('leaving the mode puts the faders back in charge', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allMode())
  fireEvent.click(allMode())
  expect(group('fm keyboard')).toBeNull()
})

test('randomize rolls that machine and leaves the others where they were', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allMode())
  const roll = screen.getAllByRole('button', { name: 'randomize' })
  expect(roll).toHaveLength(5)
  fireEvent.click(roll[0]!)
  const now = engine.controls.get()
  expect(sameControls(now, DEFAULT_CONTROLS)).toBe(false)
  expect(now.drumLevel).toBe(DEFAULT_CONTROLS.drumLevel)
  expect(now.fmLevel).toBe(DEFAULT_CONTROLS.fmLevel)
})

test('the roll caret picks a kind, rolls it and keeps it on the face', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allMode())
  fireEvent.click(
    screen.getByRole('button', { name: 'pick a kind of roll for Toy drums' }),
  )
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
  fireEvent.click(allMode())
  const before = engine.controls.get()
  fireEvent.click(screen.getAllByRole('button', { name: 'randomize' })[2]!)
  expect(sameControls(engine.controls.get(), before)).toBe(false)
  fireEvent.click(
    screen.getByRole('button', { name: 'pick a kind of roll for FM chip' }),
  )
  fireEvent.click(screen.getByRole('menuitem', { name: 'undo' }))
  expect(sameControls(engine.controls.get(), before)).toBe(true)
})

test('mute silences one machine and keeps its level, and a roll leaves it muted', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allMode())
  const mute = screen.getByRole('button', { name: 'mute Toy drums' })
  expect(mute.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(mute)
  expect(engine.controls.get().drumMute).toBe(1)
  expect(engine.controls.get().drumLevel).toBe(DEFAULT_CONTROLS.drumLevel)
  expect(mute.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getAllByRole('button', { name: 'randomize' })[1]!)
  expect(engine.controls.get().drumMute).toBe(1)
  fireEvent.click(mute)
  expect(engine.controls.get().drumMute).toBe(0)
})

test('each machine has a Level slider that moves its own level', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allMode())
  const levels = screen.getAllByRole('slider', { name: 'Level' })
  expect(levels).toHaveLength(5)
  fireEvent.change(levels[1]!, { target: { value: '0' } })
  expect(engine.controls.get().drumLevel).toBe(0)
  expect(engine.controls.get().chipLevel).toBe(DEFAULT_CONTROLS.chipLevel)
})

test('every machine on the shared rail shows the rail lamp', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allMode())
  for (const name of [
    'toy keyboard',
    'toy drums',
    'fm keyboard',
    'home keyboard',
    'mono synth',
  ])
    expect(within(group(name)!).getByText('4.50 V')).toBeTruthy()
})

test('a machine pulled down to no level stays on the bench', () => {
  engine.set('fmLevel', 0.5)
  render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(group('fm keyboard')).not.toBeNull()
  act(() => engine.set('fmLevel', 0))
  expect(group('fm keyboard')).not.toBeNull()
})

const pedalsMenu = () => screen.getByRole('button', { name: /^pedals/ })

test('no pedal sits on the bench until it is switched in from the menu', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  expect(group('stompbox')).toBeNull()
  fireEvent.click(pedalsMenu())
  fireEvent.click(screen.getByRole('checkbox', { name: 'stompbox' }))
  expect(group('stompbox')).not.toBeNull()
  expect(group('tube amp')).toBeNull()
  expect(pedalsMenu().textContent).toContain('1')
  fireEvent.click(screen.getByRole('checkbox', { name: 'stompbox' }))
  expect(group('stompbox')).toBeNull()
})

const allPedals = () => screen.getByRole('button', { name: / all pedals/ })

test('add all pedals benches all six and leaves their mixes alone', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allPedals())
  expect(bench.get().pedals).toHaveLength(6)
  for (const name of ['stompbox', 'tube amp', 'spring verb'])
    expect(group(name)).not.toBeNull()
  expect(shownOn(engine.controls.get()).has('Tube amp')).toBe(true)
  expect(engine.controls.get().ampMix).toBe(DEFAULT_CONTROLS.ampMix)
  expect(allPedals().textContent).toBe('− put all pedals away')
  fireEvent.click(allPedals())
  expect(bench.get().pedals).toEqual([])
  expect(group('stompbox')).toBeNull()
})

test('a pedal face bypasses its pedal, opens its panel and puts itself away', () => {
  const opened: string[] = []
  bench.set({
    all: false,
    closed: [],
    pedals: ['Spring verb'],
    roll: false,
    grid: false,
  })
  render(<Instruments seconds={0} onOpen={s => opened.push(s)} />)
  expect(screen.getAllByRole('slider').length).toBeGreaterThan(2)
  const bypass = screen.getByRole('button', { name: 'bypass Spring verb' })
  fireEvent.click(bypass)
  expect(engine.controls.get().revMute).toBe(1)
  expect(bypass.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(bypass)
  expect(engine.controls.get().revMute).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'all controls' }))
  expect(opened).toEqual(['Spring verb'])
  fireEvent.click(screen.getByRole('button', { name: 'close Spring verb' }))
  expect(group('spring verb')).toBeNull()
  expect(bench.get().pedals).toEqual([])
})

test('a pedal slider moves its own control and goes back to stock on a double press', () => {
  bench.set({
    all: false,
    closed: [],
    pedals: ['Spring verb'],
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
    all: false,
    closed: [],
    pedals: ['Stompbox'],
    roll: false,
    grid: false,
  })
  render(<Instruments seconds={0} onOpen={() => {}} />)
  const before = engine.controls.get().stompCircuit
  fireEvent.click(screen.getByRole('button', { name: /^Circuit: / }))
  expect(engine.controls.get().stompCircuit).toBe(before + 1)
})

test('the stage panel of a pedal puts it on the bench and takes it off', () => {
  const verb = GROUPS.find(g => g.name === 'Spring verb')!
  render(<OpenGroup group={verb} onClose={() => {}} seconds={0} />)
  const toggle = screen.getByRole('button', { name: 'bench' })
  fireEvent.click(toggle)
  expect(bench.get().pedals).toEqual(['Spring verb'])
  expect(toggle.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(toggle)
  expect(bench.get().pedals).toEqual([])
})

test('an instrument stage panel has no bench toggle', () => {
  const toy = GROUPS.find(g => g.name === 'Toy keyboard')!
  render(<OpenGroup group={toy} onClose={() => {}} seconds={0} />)
  expect(screen.queryByRole('button', { name: 'bench' })).toBeNull()
})

test('the mode and what was closed are stored for the next load', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allMode())
  fireEvent.click(screen.getByRole('button', { name: 'close FM chip' }))
  expect(parseBench(localStorage.getItem('bender.bench'))).toEqual({
    all: true,
    closed: ['FM chip'],
    pedals: [],
    roll: false,
    grid: false,
  })
})

test('a stored bench that is not one reads as the default', () => {
  const stock = { all: false, closed: [], pedals: [], roll: false, grid: false }
  expect(parseBench('{')).toEqual(stock)
  expect(parseBench('7')).toEqual(stock)
  expect(
    parseBench('{"all":true,"closed":["FM chip",3],"pedals":["Tube amp",1]}'),
  ).toEqual({
    all: true,
    closed: ['FM chip'],
    pedals: ['Tube amp'],
    roll: false,
    grid: false,
  })
  expect(parseBench('{"all":true,"closed":[]}').pedals).toEqual([])
})

test('a machine on the bench in all-instruments mode has its box on the map', () => {
  render(<Instruments seconds={0} onOpen={() => {}} />)
  fireEvent.click(allMode())
  expect(shownOn(engine.controls.get()).has('Mono synth')).toBe(true)
  fireEvent.click(allMode())
  expect(shownOn(engine.controls.get()).has('Mono synth')).toBe(false)
})

test('the piano roll stays out of the toy keyboard panel until it is shown', () => {
  const toy = GROUPS.find(g => g.name === 'Toy keyboard')!
  render(<OpenGroup group={toy} onClose={() => {}} seconds={0} />)
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
  const kit = GROUPS.find(g => g.name === 'Toy drums')!
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

// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { GRID_ROWS, hasStep } from '../drums.ts'
import { ECHO_MODE } from '../dsp/stages/echo.ts'
import { ENS_MODE } from '../dsp/stages/ensemble.ts'
import { engine } from '../engine/engine.ts'
import { App } from './App.tsx'
import { bench } from './bench.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

beforeEach(() => {
  bench.set({ ...bench.get(), roll: true, grid: true })
})

// What the panel does with a board. The suite reached everything under the
// panel and nothing in it, which is how a heading that miscounted, a ROM you
// could not take back and a drop that navigated the page away all survived at
// once — each of them is a sentence about what happens when you press
// something, and none of them is a sentence about a signal path.

const FLANGE = ENS_MODE.flange

const group = (name: string) => {
  const g = GROUPS.find(each => each.name === name)
  if (!g) throw new Error(`no group ${name}`)
  return g
}

// The controls a fold is holding open: a knob or an ordered pick is a slider,
// and a long unordered pick is a list.
const countRows = (head: HTMLElement) => {
  const fold = within(head.parentElement!)
  return (
    fold.queryAllByRole('slider').length +
    fold.queryAllByRole('combobox').length
  )
}

// A fold is a <details>, so its heading is the summary rather than a button.
const line = () => {
  const head = [...document.querySelectorAll('summary')].find(s =>
    /the line/.test(s.textContent ?? ''),
  )
  if (!head) throw new Error('no line fold')
  return head
}
const said = (head: HTMLElement) => Number(head.textContent.replace(/\D/g, ''))

const openFmChip = () =>
  render(<OpenGroup group={group('Glint')} onClose={() => {}} seconds={0} />)

const openEnsemble = () =>
  render(<OpenGroup group={group('Chorale')} onClose={() => {}} seconds={0} />)

// The number on a fold is what it opens to. A fault picks what happened to a
// wire nobody has cut, so the row waits for a wire — and a heading that counted
// the ones still waiting promised controls that were not down there.
test('a fold heading counts the rows it opens to', () => {
  openEnsemble()
  const before = said(line())
  fireEvent.click(line())
  expect(before).toBeGreaterThan(0)
  expect(before).toBe(countRows(line()))
})

// Cut a line and the fault asking what happened to it arrives under the same
// heading. The heading is holding something you moved by then, so it says that
// instead of a count — a fold that hid what you set would be lying about the
// board.
test('a row arrives once it has something to act on', () => {
  openEnsemble()
  fireEvent.click(line())
  const before = countRows(line())

  act(() => engine.set('ensMode', FLANGE))
  expect(countRows(line())).toBe(before + 1)
  act(() => engine.set('ensFeedback', 0.4))
  expect(line().textContent).toContain('1 moved')
})

// A knife on a bus is three controls that only mean anything together, and most
// of the combinations are a wire you can cut and hear nothing. The row of named
// cuts is the way in: one press wires one, the rows under it say which controls
// that was, and pressing another is that cut rather than the two of them at once.
test('a named cut wires itself, and the next one replaces it', () => {
  openFmChip()
  fireEvent.click(screen.getByRole('button', { name: 'bus controls' }))

  fireEvent.click(screen.getByRole('button', { name: 'the note never ends' }))
  expect(engine.controls.get().fmDataLine).toBeGreaterThan(0)
  // The chip boots silent and has no keyboard of its own, so a cut you cannot
  // hear would be the whole of what the press did.
  expect(engine.controls.get().fmLevel).toBeGreaterThan(0)

  expect(screen.queryByRole('button', { name: 'no fundamental' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^\d+ more$/ }))
  fireEvent.click(screen.getByRole('button', { name: 'no fundamental' }))
  expect(engine.controls.get().fmDataLine).toBe(DEFAULT_CONTROLS.fmDataLine)
  expect(engine.controls.get().fmWaveLine).toBeGreaterThan(0)

  fireEvent.click(screen.getByRole('button', { name: 'none' }))
  expect(engine.controls.get().fmWaveLine).toBe(DEFAULT_CONTROLS.fmWaveLine)
  expect(engine.controls.get().fmLevel).toBeGreaterThan(0)
})

test('the home keyboard’s data bus box carries the named cuts', () => {
  render(<OpenGroup group={group('Parlor')} onClose={() => {}} seconds={0} />)
  fireEvent.click(screen.getByRole('button', { name: 'data bus controls' }))
  fireEvent.click(screen.getByRole('button', { name: 'the top bit sticks' }))
  expect(engine.controls.get().pcmDataLine).toBeGreaterThan(0)
  expect(engine.controls.get().pcmLevel).toBeGreaterThan(0)
})

// A control the stage has nothing to act on yet stays off the panel — but only
// until your hand has been on it, because a knob you have set is a knob you get
// to see whatever the switch beside it says.
test('the mod depth waits for the mode that uses it', () => {
  render(<OpenGroup group={group('Ricochet')} onClose={() => {}} seconds={0} />)
  expect(screen.queryByRole('slider', { name: 'Mod depth' })).toBeNull()
  act(() => engine.set('echoMode', ECHO_MODE.modulate))
  expect(screen.getByRole('slider', { name: 'Mod depth' })).toBeTruthy()
  act(() => engine.set('echoMode', ECHO_MODE.standard))
  expect(screen.queryByRole('slider', { name: 'Mod depth' })).toBeNull()
  act(() => engine.set('echoMod', 0.8))
  expect(screen.getByRole('slider', { name: 'Mod depth' })).toBeTruthy()
})

// The kit had no pads: the only thing a hand could strike unaided was one row's
// name at a time, which is enough to hear a voice and nowhere near enough to
// play a bar in. The number row is the kit's keys, and it answers wherever the
// panel happens to be — the same as the toy keyboard's letters do.
test('a number key strikes the kit, and writes it when record is armed', () => {
  render(<App />)
  // Thirty to the bar, so a step is half a second: the hit is quantized against
  // how long ago the kit's last step arrived, and a render in jsdom is easily
  // half of one at a musical tempo.
  act(() => {
    engine.setDrumsPlaying(true)
    engine.patch({ drumKick: 0, drumSnare: 0, drumSwing: 0, drumBpm: 30 })
  })

  // Unarmed, a pad is a sound and nothing else — as it is on every other wire
  // into the trigger line.
  fireEvent.keyDown(window, { key: '1', code: 'Digit1' })
  expect(engine.controls.get().drumKick).toBe(0)

  act(() => {
    engine.drumRecord.set(true)
    engine.meter.set({ ...engine.meter.get(), tick: 3 })
  })
  fireEvent.keyDown(window, { key: '2', code: 'Digit2' })
  expect(hasStep(engine.controls.get().drumSnare, 3)).toBe(true)

  // A digit typed into a control belongs to the control. The panel picks a row
  // length and a morph duration by keyboard, and a kick under every one of
  // those would make the kit unplayable from the panel.
  const box = document.createElement('input')
  document.body.append(box)
  fireEvent.keyDown(box, { key: '1', code: 'Digit1' })
  expect(engine.controls.get().drumKick).toBe(0)
  box.remove()
})

// Every knob says what it is and where it stands, in its own units.
test('a slider carries its name and its own units', () => {
  render(<OpenGroup group={group('Wraith')} onClose={() => {}} seconds={0} />)
  const time = screen.getByRole('slider', { name: 'Time' })
  act(() => engine.set('delayMs', 1200))
  // The track underneath runs 0 to 1000 whatever the control is, and on a log
  // slider it is not even proportional to the value — so the position is the one
  // number nobody should have read out to them.
  expect(time.getAttribute('max')).toBe('1000')
  expect((time as HTMLInputElement).value).not.toBe('1200')
  expect(time.getAttribute('aria-valuetext')).toBe('1200 ms')
})

// The kit's ROM buttons write over whatever you had drawn, so they land in the
// walk like every other verb on the panel.
test('a drum ROM lands in the walk, and ctrl+z takes it back', () => {
  render(<OpenGroup group={group('Clatter')} onClose={() => {}} seconds={0} />)
  act(() => {
    engine.armStep()
    engine.set('drumKick', 0b1010101010101010)
  })
  const mine = engine.controls.get().drumKick

  fireEvent.click(screen.getByRole('button', { name: 'breaks' }))
  expect(engine.controls.get().drumKick).not.toBe(mine)

  act(() => engine.undo(0))
  expect(engine.controls.get().drumKick).toBe(mine)
})

// Sixteen contacts closed one at a time is sixteen presses. A hand draws a run
// of steps by dragging across them, and the whole drag is one thing that
// happened: one entry in the walk, however many steps it wrote.
test('a drag across the grid draws a run of steps, and one undo takes it back', () => {
  render(<OpenGroup group={group('Clatter')} onClose={() => {}} seconds={0} />)
  const cell = (step: number) =>
    screen.getByRole('button', { name: `tom step ${step + 1}` })

  fireEvent.pointerDown(cell(1))
  for (const step of [2, 3, 4])
    fireEvent.pointerOver(cell(step), { buttons: 1 })
  const drawn = engine.controls.get().drumTom
  for (const step of [1, 2, 3, 4])
    expect(hasStep(drawn, step), `${step}`).toBe(true)

  act(() => engine.undo(0))
  expect(engine.controls.get().drumTom).toBe(DEFAULT_CONTROLS.drumTom)
})

// Which way the drag writes is settled by the step it started on, not by each
// step it reaches: a drag that decided per cell would rub the row out and
// straight back in again. Three states, so a drag off a lit step wires the run
// it crosses through the dice and one off a maybe wipes it.
test('a drag writes whatever the step it started on became', () => {
  render(<OpenGroup group={group('Clatter')} onClose={() => {}} seconds={0} />)
  const cell = (step: number) =>
    screen.getByRole('button', { name: `hat step ${step + 1}` })
  const run = [2, 3, 4, 5, 6]

  // Step 3 is one of the rock ROM's hats, so the drag sets off from a lit step.
  fireEvent.pointerDown(cell(2))
  for (const step of [3, 4, 5, 6])
    fireEvent.pointerOver(cell(step), { buttons: 1 })
  const dice = engine.controls.get()
  for (const step of run) {
    expect(hasStep(dice.drumHat, step), `${step}`).toBe(false)
    expect(hasStep(dice.drumHatMaybe, step), `${step}`).toBe(true)
  }

  fireEvent.pointerUp(window)
  fireEvent.pointerDown(cell(2))
  for (const step of [3, 4, 5, 6])
    fireEvent.pointerOver(cell(step), { buttons: 1 })
  const left = engine.controls.get()
  for (const step of run) {
    expect(hasStep(left.drumHat, step), `${step}`).toBe(false)
    expect(hasStep(left.drumHatMaybe, step), `${step}`).toBe(false)
  }
})

// Three states on one contact, and one click each way round them. The two masks
// never hold the same step, because what the grid draws is what the kit reads.
test('a step cycles off, on, wired through the dice, off', () => {
  render(<OpenGroup group={group('Clatter')} onClose={() => {}} seconds={0} />)
  const cell = screen.getByRole('button', { name: 'tom step 5' })
  const at = () => {
    const c = engine.controls.get()
    return [
      hasStep(c.drumTom, 4),
      hasStep(c.drumTomMaybe, 4),
      cell.getAttribute('aria-pressed'),
    ]
  }
  expect(at()).toEqual([false, false, 'false'])
  fireEvent.pointerDown(cell)
  expect(at()).toEqual([true, false, 'true'])
  fireEvent.pointerDown(cell)
  expect(at()).toEqual([false, true, 'mixed'])
  fireEvent.pointerDown(cell)
  expect(at()).toEqual([false, false, 'false'])

  // And the round trip is three steps in the walk, not six: the click that
  // moved both masks at once is still one click.
  act(() => engine.undo(0))
  expect(at()).toEqual([false, true, 'mixed'])
  act(() => engine.undo(0))
  expect(at()).toEqual([true, false, 'true'])
  act(() => engine.undo(0))
  expect(at()).toEqual([false, false, 'false'])
})

// The accent row has no maybe mask — it is a weight rather than a hit — so its
// contact is the two-state contact it always was.
test('the accent row has no dice on it', () => {
  render(<OpenGroup group={group('Clatter')} onClose={() => {}} seconds={0} />)
  const cell = screen.getByRole('button', { name: 'accent step 5' })
  fireEvent.pointerDown(cell)
  expect(hasStep(engine.controls.get().drumAccent, 4)).toBe(true)
  fireEvent.pointerDown(cell)
  expect(hasStep(engine.controls.get().drumAccent, 4)).toBe(false)
})

// A pointer crossing the grid on its way somewhere else is not a hand drawing.
test('a pointer with nothing held down writes nothing', () => {
  render(<OpenGroup group={group('Clatter')} onClose={() => {}} seconds={0} />)
  const before = engine.controls.get().drumTom
  fireEvent.pointerOver(screen.getByRole('button', { name: 'tom step 5' }), {
    buttons: 0,
  })
  expect(engine.controls.get().drumTom).toBe(before)
})

// A drag is over when the hand lets go, wherever it lets go. The direction
// outliving the gesture meant the next press anywhere on the page — a ROM
// button a centimetre above the grid — carried on drawing the run before it.
test('a drag that began off the grid draws nothing on it', () => {
  render(<OpenGroup group={group('Clatter')} onClose={() => {}} seconds={0} />)
  const cell = (step: number) =>
    screen.getByRole('button', { name: `tom step ${step + 1}` })

  fireEvent.pointerDown(cell(0))
  fireEvent.pointerOver(cell(1), { buttons: 1 })
  fireEvent.pointerUp(window)
  const drawn = engine.controls.get().drumTom

  fireEvent.pointerDown(screen.getByRole('button', { name: 'rock' }))
  for (const step of [4, 5, 6])
    fireEvent.pointerOver(cell(step), { buttons: 1 })
  expect(engine.controls.get().drumTom).toBe(drawn)
})

// The moves rewrite the grid and nothing else about the kit, and they land in
// the walk the way the ROM buttons do.
test('a turnaround writes the end of the bar, keeps the tempo, and takes back', () => {
  render(<OpenGroup group={group('Clatter')} onClose={() => {}} seconds={0} />)
  act(() => engine.set('drumBpm', 96))
  const before = engine.controls.get()

  fireEvent.click(screen.getByRole('button', { name: 'turnaround' }))
  const after = engine.controls.get()
  expect(after.drumBpm).toBe(96)
  expect(GRID_ROWS.some(row => after[row.key] !== before[row.key])).toBe(true)

  act(() => engine.undo(0))
  for (const row of GRID_ROWS)
    expect(engine.controls.get()[row.key], row.key).toBe(before[row.key])
})

test('the board and the panel are landmarks of their own', () => {
  const { container } = render(<App />)
  expect(container.querySelector('main')).toBeTruthy()
  expect(container.querySelector('aside')).toBeTruthy()
})

const frame = () =>
  act(async () => {
    await new Promise(r => requestAnimationFrame(() => r(null)))
  })

// The picker is the only place the next roll's duration is set, and a drift
// runs until you stop it — so a leg of one must not stand in for a morph.
test('a drift leaves the morph picker where it is', async () => {
  render(<App />)
  act(() => engine.startDrift(() => ({ ...DEFAULT_CONTROLS, dlyFb: 0.9 })))
  await frame()

  // Mid-leg, which is exactly when the flight bar used to take the row.
  expect(engine.morphProgress.get()).not.toBeNull()
  expect(screen.queryByText('stop here')).toBeNull()
  expect(screen.getByDisplayValue(/^morph:/)).toBeTruthy()

  // And stopping keeps the board where it has got to, rather than letting the
  // leg carry it somewhere else for another twelve seconds.
  act(() => {
    fireEvent.click(screen.getByText('drifting…'))
  })
  expect(engine.drifting.get()).toBe(false)
  expect(engine.morphProgress.get()).toBeNull()
})

// A morph is still what the bar is for, and it still takes the picker's place
// while one travels.
test('a morph in flight puts the bar up instead', async () => {
  render(<App />)
  act(() => engine.morphTo({ ...DEFAULT_CONTROLS, dlyFb: 0.9 }, 8))
  await frame()
  expect(screen.getByText('stop here')).toBeTruthy()
  expect(screen.queryByDisplayValue(/^morph:/)).toBeNull()
})

// A heading is where the board keeps the controls that only mean anything
// together, so it gets its own dice: rolling the whole stage to hear a
// different knife on the bus re-rolls the clock and the supply as well, and
// what you get is a different board rather than a different cut.
const inFold = (head: HTMLElement, name: RegExp) =>
  within(head.parentElement!).getByRole('button', { name })

test('a fold rolls its own rows and leaves the rest of the stage alone', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  openEnsemble()
  fireEvent.click(line())
  const rows = group('Chorale')
    .sliders.filter(s => s.part === 'the line')
    .map(s => s.key)
  const outside = group('Chorale')
    .sliders.filter(s => !rows.includes(s.key))
    .map(s => s.key)
  const was = { ...engine.controls.get() }

  act(() => {
    fireEvent.click(inFold(line(), /^roll$/))
  })
  const now = engine.controls.get()
  expect(rows.some(k => now[k] !== was[k])).toBe(true)
  for (const k of outside) expect(now[k]).toBe(was[k])
})

// And its own way back, which is the count it is carrying.
test('a fold puts back only what is under it', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS, ensWidth: 0.4, ensMix: 0.9 }))
  openEnsemble()
  fireEvent.click(line())
  act(() => {
    fireEvent.click(inFold(line(), /^reset 1$/))
  })
  expect(engine.controls.get().ensWidth).toBe(DEFAULT_CONTROLS.ensWidth)
  expect(engine.controls.get().ensMix).toBe(0.9)
})

test('undo on a fold takes back its roll and keeps a knob turned since', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  openEnsemble()
  fireEvent.click(line())
  const was = { ...engine.controls.get() }
  act(() => {
    fireEvent.click(inFold(line(), /^roll$/))
  })
  act(() => engine.set('ensMix', 0.9))
  act(() => {
    fireEvent.click(inFold(line(), /^undo$/))
  })
  expect({ ...engine.controls.get(), ensMix: was.ensMix }).toEqual(was)
  expect(engine.controls.get().ensMix).toBe(0.9)
  expect((inFold(line(), /^undo$/) as HTMLButtonElement).disabled).toBe(true)
})

test('undo on a stage walks back its rolls one at a time', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  openFmChip()
  const undo = () =>
    screen.getAllByRole('button', { name: /^undo$/ })[0] as HTMLButtonElement
  expect(undo().disabled).toBe(true)
  const roll = () => screen.getAllByRole('button', { name: /^roll$/ })[0]!
  const boot = { ...engine.controls.get() }
  act(() => {
    fireEvent.click(roll())
  })
  const first = { ...engine.controls.get() }
  act(() => {
    fireEvent.click(roll())
  })
  act(() => {
    fireEvent.click(undo())
  })
  expect(engine.controls.get()).toEqual(first)
  act(() => {
    fireEvent.click(undo())
  })
  expect(engine.controls.get()).toEqual(boot)
  expect(undo().disabled).toBe(true)
})

test('a fold with nothing moved under it offers no way back', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  openEnsemble()
  fireEvent.click(line())
  expect((inFold(line(), /^reset$/) as HTMLButtonElement).disabled).toBe(true)
})

// A travel whose middle is a stop and whose bottom half is backwards. The knob
// pulls to the stop, because the values a hair either side of it are a tape
// going one way and a tape going the other, and landing on neither by dragging
// past is the thing that made the change too quiet to notice.
const speed = () => {
  render(<OpenGroup group={group('Spool')} onClose={() => {}} seconds={1} />)
  return screen.getByRole('slider', { name: 'Speed' })
}

test('a split travel pulls to its turn and says which side it is on', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  const knob = speed()

  fireEvent.pointerDown(knob)
  fireEvent.change(knob, { target: { value: '505' } })
  expect(engine.controls.get().sampleSpeed).toBe(0)
  expect(knob.getAttribute('aria-valuetext')).toBe('frozen')

  fireEvent.change(knob, { target: { value: '300' } })
  expect(engine.controls.get().sampleSpeed).toBeLessThan(0)
  expect(knob.getAttribute('aria-valuetext')).toBe('0.996× reverse')
})

// The pull is the drag's, not the keyboard's. A key step is a fifth of the
// width of the turn, so a knob that pulled for keys too would be a knob the
// keys could park on the stop and never walk off again.
test('a split travel still steps off its turn under the arrow keys', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS, sampleSpeed: 0 }))
  const knob = speed()
  fireEvent.keyDown(knob, { key: 'ArrowRight' })
  fireEvent.change(knob, { target: { value: '650' } })
  expect(engine.controls.get().sampleSpeed).toBeGreaterThan(0)
})

test('a normal stretch draws its redline and reddens the readout past it', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  openFmChip()
  const knob = screen.getByRole('slider', { name: 'Feedback' })
  const row = knob.closest<HTMLElement>('[class*="row"]')!
  const over = () => row.querySelector('[class*="readoutOver"]')
  expect(row.querySelectorAll('[class*="redline"]')).toHaveLength(1)

  fireEvent.change(knob, { target: { value: '750' } })
  expect(engine.controls.get().fmFeedback).toBe(7)
  expect(over()).toBeNull()

  fireEvent.change(knob, { target: { value: '1000' } })
  expect(engine.controls.get().fmFeedback).toBe(11)
  expect(over()?.textContent).toMatch(/^11/)
})

test('the ↺ beside an off-stock reading puts the control back to stock', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  openFmChip()
  const knob = screen.getByRole('slider', { name: 'Feedback' })
  fireEvent.change(knob, { target: { value: '1000' } })
  const reset = screen.getByRole('button', { name: /^reset Feedback to / })
  expect(reset.textContent).toBe('↺')
  fireEvent.click(reset)
  expect(engine.controls.get().fmFeedback).toBe(DEFAULT_CONTROLS.fmFeedback)
})

test('clicking a reading takes a typed value, and Escape leaves it be', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  openFmChip()
  const type = () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'type a value for Feedback' }),
    )
  type()
  const field = screen.getByRole('textbox', { name: 'type Feedback' })
  fireEvent.change(field, { target: { value: '5' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  fireEvent.blur(field)
  expect(engine.controls.get().fmFeedback).toBe(5)
  type()
  const again = screen.getByRole('textbox', { name: 'type Feedback' })
  fireEvent.change(again, { target: { value: '2' } })
  fireEvent.keyDown(again, { key: 'Escape' })
  fireEvent.blur(again)
  expect(engine.controls.get().fmFeedback).toBe(5)
})

test('the tape loop stays off the bench until it is added or its level comes up', () => {
  bench.set({ ...bench.get(), all: false, closed: [] })
  render(<App />)
  const tape = () => screen.queryByRole('region', { name: 'spool' })
  expect(tape()).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '+ add all instruments' }))
  expect(tape()).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'put away Spool' }))
  expect(tape()).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '+ spool' }))
  expect(tape()).not.toBeNull()
  fireEvent.click(
    screen.getByRole('button', { name: '− hide unused instruments' }),
  )
  expect(tape()).toBeNull()
  act(() => engine.set('sampleLevel', 0.7))
  expect(tape()).not.toBeNull()
})

test("a face's name plate opens its stage in the panel", () => {
  render(<App />)
  const panel = screen.getByRole('complementary', { name: 'the board' })
  const close = () =>
    within(panel).queryByRole('button', { name: 'close Clatter' })
  expect(close()).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Clatter settings' }))
  expect(close()).not.toBeNull()
})

test('a pinned control plays from the strip beside the instruments', () => {
  render(<App />)
  fireEvent.click(document.querySelector('a[data-door="Mix bus"]')!)
  const strip = () => screen.queryByRole('region', { name: 'pinned controls' })
  expect(strip()).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'pin Bus drive' }))
  const knob = within(strip()!).getByRole('slider', {
    name: 'Mix bus · Bus drive',
  })
  fireEvent.change(knob, { target: { value: '1000' } })
  expect(engine.controls.get().mixDrive).not.toBe(DEFAULT_CONTROLS.mixDrive)
  fireEvent.click(
    within(strip()!).getByRole('button', { name: 'unpin Mix bus · Bus drive' }),
  )
  expect(strip()).toBeNull()
})

test('the map folds to a row of stages while one is open', () => {
  render(<App />)
  const map = () =>
    document.querySelector<HTMLElement>('[aria-label="signal path"]')!
  fireEvent.click(screen.getByRole('button', { name: 'Clatter settings' }))
  fireEvent.click(screen.getByRole('button', { name: '▴ fold the map' }))
  expect(map().hidden).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /^Plinky$/ }))
  expect(screen.getByRole('button', { name: 'close Plinky' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'close Plinky' }))
  expect(map().hidden).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Clatter settings' }))
  expect(map().hidden).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '▾ show the map' }))
  expect(map().hidden).toBe(false)
})

// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { ECHO_MODE } from '../dsp/stages/echo'
import { GRID_ROWS, hasStep } from '../drums'
import { engine } from '../engine/engine'
import { App } from './App'
import { GROUPS } from './controls'
import { OpenGroup } from './Section'
import './testDom'

// What the panel does with a board. The suite reached everything under the
// panel and nothing in it, which is how a heading that miscounted, a ROM you
// could not take back and a drop that navigated the page away all survived at
// once — each of them is a sentence about what happens when you press
// something, and none of them is a sentence about a signal path.

const group = (name: string) => {
  const g = GROUPS.find(g => g.name === name)
  if (!g) throw new Error(`no group ${name}`)
  return g
}

// The controls a fold is holding open: a knob is a slider, and a pick with more
// than six choices is a list.
const countRows = (head: HTMLElement) => {
  const fold = within(head.parentElement!)
  return (
    fold.queryAllByRole('slider').length +
    fold.queryAllByRole('combobox').length
  )
}

// A fold is a <details>, so its heading is the summary rather than a button.
const knife = () => {
  const head = [...document.querySelectorAll('summary')].find(s =>
    /knife on the bus/.test(s.textContent ?? ''),
  )
  if (!head) throw new Error('no knife fold')
  return head as HTMLElement
}
const said = (head: HTMLElement) => Number(head.textContent!.replace(/\D/g, ''))

const openFmChip = () =>
  render(<OpenGroup group={group('FM chip')} onClose={() => {}} seconds={0} />)

// The number on a fold is what it opens to. A fault picks what happened to a
// wire nobody has cut, so the row waits for a wire — and a heading that counted
// the ones still waiting promised controls that were not down there.
test('a fold heading counts the rows it opens to', () => {
  openFmChip()
  const before = said(knife())
  fireEvent.click(knife())
  expect(before).toBeGreaterThan(0)
  expect(before).toBe(countRows(knife()))
})

// Cut a line and the fault asking what happened to it arrives under the same
// heading. The heading is holding something you moved by then, so it says that
// instead of a count — a fold that hid what you set would be lying about the
// board.
test('a row arrives once it has something to act on', () => {
  openFmChip()
  fireEvent.click(knife())
  const before = countRows(knife())

  act(() => engine.set('fmDataLine', 1))
  expect(countRows(knife())).toBe(before + 1)
  expect(knife().textContent).toContain('1 moved')
})

// A knife on a bus is three controls that only mean anything together, and most
// of the combinations are a wire you can cut and hear nothing. The row of named
// cuts is the way in: one press wires one, the rows under it say which controls
// that was, and pressing another is that cut rather than the two of them at once.
test('a named cut wires itself, and the next one replaces it', () => {
  openFmChip()
  fireEvent.click(knife())

  fireEvent.click(screen.getByRole('button', { name: 'the note never ends' }))
  expect(engine.controls.get().fmDataLine).toBeGreaterThan(0)
  // The chip boots silent and has no keyboard of its own, so a cut you cannot
  // hear would be the whole of what the press did.
  expect(engine.controls.get().fmLevel).toBeGreaterThan(0)

  fireEvent.click(screen.getByRole('button', { name: 'no fundamental' }))
  expect(engine.controls.get().fmDataLine).toBe(DEFAULT_CONTROLS.fmDataLine)
  expect(engine.controls.get().fmWaveLine).toBeGreaterThan(0)

  // Shut again, the heading names the knife rather than counting the controls
  // it moved: which cut is on the bus is the thing worth reading from outside.
  expect(knife().textContent).toContain('no fundamental')

  fireEvent.click(screen.getByRole('button', { name: 'none' }))
  expect(engine.controls.get().fmWaveLine).toBe(DEFAULT_CONTROLS.fmWaveLine)
  expect(engine.controls.get().fmLevel).toBeGreaterThan(0)
})

// A control the stage has nothing to act on yet stays off the panel — but only
// until your hand has been on it, because a knob you have set is a knob you get
// to see whatever the switch beside it says.
test('the mod depth waits for the mode that uses it', () => {
  render(
    <OpenGroup group={group('Delay pedal')} onClose={() => {}} seconds={0} />,
  )
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
  render(
    <OpenGroup group={group('Tape delay')} onClose={() => {}} seconds={0} />,
  )
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
  render(
    <OpenGroup group={group('Toy drums')} onClose={() => {}} seconds={0} />,
  )
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
  render(
    <OpenGroup group={group('Toy drums')} onClose={() => {}} seconds={0} />,
  )
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
  render(
    <OpenGroup group={group('Toy drums')} onClose={() => {}} seconds={0} />,
  )
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
  render(
    <OpenGroup group={group('Toy drums')} onClose={() => {}} seconds={0} />,
  )
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
  render(
    <OpenGroup group={group('Toy drums')} onClose={() => {}} seconds={0} />,
  )
  const cell = screen.getByRole('button', { name: 'accent step 5' })
  fireEvent.pointerDown(cell)
  expect(hasStep(engine.controls.get().drumAccent, 4)).toBe(true)
  fireEvent.pointerDown(cell)
  expect(hasStep(engine.controls.get().drumAccent, 4)).toBe(false)
})

// A pointer crossing the grid on its way somewhere else is not a hand drawing.
test('a pointer with nothing held down writes nothing', () => {
  render(
    <OpenGroup group={group('Toy drums')} onClose={() => {}} seconds={0} />,
  )
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
  render(
    <OpenGroup group={group('Toy drums')} onClose={() => {}} seconds={0} />,
  )
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
  render(
    <OpenGroup group={group('Toy drums')} onClose={() => {}} seconds={0} />,
  )
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

// The hint says anywhere, and a dragover nobody cancels is a drop the browser
// takes itself — which over the panel, half the width of the app, meant
// navigating away from the board.
test('a drag over the panel is a drag the app has taken', () => {
  render(<App />)
  // One button deep in the panel and one on the machines beside it, because
  // anywhere has to mean both columns.
  for (const label of [/^panic$/, /play drums/]) {
    const over = new Event('dragover', { bubbles: true, cancelable: true })
    screen.getByRole('button', { name: label }).dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
  }
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
  act(() => fireEvent.click(screen.getByText('drifting…')))
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
  openFmChip()
  fireEvent.click(knife())
  const rows = group('FM chip')
    .sliders.filter(s => s.part === 'knife on the bus')
    .map(s => s.key)
  const outside = group('FM chip')
    .sliders.filter(s => !rows.includes(s.key))
    .map(s => s.key)
  const was = { ...engine.controls.get() }

  act(() => fireEvent.click(inFold(knife(), /^roll$/)))
  const now = engine.controls.get()
  expect(rows.some(k => now[k] !== was[k])).toBe(true)
  for (const k of outside) expect(now[k]).toBe(was[k])
})

// And its own way back, which is the count it is carrying.
test('a fold puts back only what is under it', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS, fmDataLine: 3, fmBright: 0.9 }))
  openFmChip()
  fireEvent.click(knife())
  act(() => fireEvent.click(inFold(knife(), /^reset 1$/)))
  expect(engine.controls.get().fmDataLine).toBe(DEFAULT_CONTROLS.fmDataLine)
  expect(engine.controls.get().fmBright).toBe(0.9)
})

test('a fold with nothing moved under it offers no way back', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  openFmChip()
  fireEvent.click(knife())
  expect((inFold(knife(), /^reset$/) as HTMLButtonElement).disabled).toBe(true)
})

// A travel whose middle is a stop and whose bottom half is backwards. The knob
// pulls to the stop, because the values a hair either side of it are a tape
// going one way and a tape going the other, and landing on neither by dragging
// past is the thing that made the change too quiet to notice.
const speed = () => {
  render(<OpenGroup group={group('Sampler')} onClose={() => {}} seconds={1} />)
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
  expect(knob.getAttribute('aria-valuetext')).toBe('0.028× reverse')
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

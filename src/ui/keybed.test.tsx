// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { DEST } from '../dsp/modbus.ts'
import { engine } from '../engine/engine.ts'
import { App } from './App.tsx'
import { DrumKit } from './DrumKit.tsx'
import { FmKeys } from './FmKeys.tsx'
import { GateBench, ModPlate } from './GateCables.tsx'
import { Keys } from './Keys.tsx'
import { ADSR, CV_DEST, LFO, modCables } from './modCables.ts'
import { MonoKeys } from './MonoKeys.tsx'
import { PcmKeys } from './PcmKeys.tsx'
import { measure, touch } from './testDom.ts'

// Three keybeds on one panel, and one computer keyboard in front of them. What
// makes that work at all is that a note says which bed it came off: the FM
// chip's key input used to be soldered to the toy's gate and nothing else, so
// every note on the board was the toy's note by construction.

const bed = (name: string) => within(screen.getByRole('group', { name }))
const middleC = (name: string) =>
  bed(name).getByRole('button', { name: 'key C4' })

// A press, the way the browser sends one: the menu dismisses itself on the
// pointer going down anywhere that is not itself, and the button that opens it
// is exactly where that has to not count.
const press = (el: HTMLElement) => {
  fireEvent.pointerDown(el)
  fireEvent.click(el)
}

const more = (name: string) =>
  bed(name).getByRole('button', { name: /^more for / })

// The letters wire lives in each bed's ⋯ menu rather than on a cap
// of its own, so moving it is two presses: open, pick.
const wireLetters = (name: string) => {
  press(more(name))
  fireEvent.click(bed(name).getByRole('checkbox'))
}

const both = () => {
  render(<Keys />)
  render(<FmKeys />)
}

const all = () => {
  both()
  render(<PcmKeys />)
}

test('a key on the FM bed plays the FM chip and not the toy', () => {
  both()
  fireEvent.pointerDown(middleC('glint'))
  expect(engine.fmKeysDown.get().size).toBe(1)
  expect(engine.keysDown.get().size).toBe(0)
  fireEvent.pointerUp(middleC('glint'))
  expect(engine.fmKeysDown.get().size).toBe(0)
})

test('a key on the toy bed still plays the toy', () => {
  both()
  fireEvent.pointerDown(middleC('plinky'))
  expect(engine.keysDown.get().size).toBe(1)
  expect(engine.fmKeysDown.get().size).toBe(0)
})

// And the third bed, which is the one that made the rule worth having: a note
// off it reaches the home keyboard and neither of the chips next door.
test('a key on the home bed plays the home keyboard alone', () => {
  all()
  fireEvent.pointerDown(middleC('parlor'))
  expect(engine.pcmKeysDown.get().size).toBe(1)
  expect(engine.keysDown.get().size).toBe(0)
  expect(engine.fmKeysDown.get().size).toBe(0)
  fireEvent.pointerUp(middleC('parlor'))
  expect(engine.pcmKeysDown.get().size).toBe(0)
})

test('a key on the mono bed plays the mono synth alone', () => {
  all()
  render(<MonoKeys />)
  fireEvent.pointerDown(middleC('growler'))
  expect(engine.monoKeysDown.get().size).toBe(1)
  expect(engine.keysDown.get().size).toBe(0)
  expect(engine.pcmKeysDown.get().size).toBe(0)
  fireEvent.pointerUp(middleC('growler'))
  expect(engine.monoKeysDown.get().size).toBe(0)
})

// The letters go to one bed at a time, so wiring them onto the home keyboard
// takes them off whichever had them, and the toy's own switch takes them back.
test('the letters reach the home bed, and the toy can take them back', () => {
  all()
  wireLetters('parlor')
  fireEvent.keyDown(window, { key: 'a' })
  expect(engine.pcmKeysDown.get().size).toBe(1)
  expect(engine.keysDown.get().size).toBe(0)
  fireEvent.keyUp(window, { key: 'a' })
  wireLetters('plinky')
  fireEvent.keyDown(window, { key: 'a' })
  expect(engine.keysDown.get().size).toBe(1)
  expect(engine.pcmKeysDown.get().size).toBe(0)
})

// One keyboard, two beds: the letters are a wire that goes to one of them, and
// the switch is what moves it. Left as it was, the letters play the toy, which
// is where every board made before there was a second bed expects them.
test('the letter keys play whichever bed they are wired to', () => {
  both()
  fireEvent.keyDown(window, { key: 'a' })
  expect(engine.keysDown.get().size).toBe(1)
  expect(engine.fmKeysDown.get().size).toBe(0)
  fireEvent.keyUp(window, { key: 'a' })

  wireLetters('glint')
  fireEvent.keyDown(window, { key: 'a' })
  expect(engine.fmKeysDown.get().size).toBe(1)
  expect(engine.keysDown.get().size).toBe(0)
})

// A letter key struck a note and then the wire moved. Nothing is going to send
// the key-up to the bed that is still holding it, so moving the wire is what
// has to let it go.
test('moving the letters lets go of what they were holding', () => {
  both()
  fireEvent.keyDown(window, { key: 'a' })
  expect(engine.keysDown.get().size).toBe(1)
  wireLetters('glint')
  expect(engine.keysDown.get().size).toBe(0)
})

test('the gate switch cuts the jumper, and the walk takes it back', () => {
  render(<FmKeys />)
  fireEvent.click(screen.getByRole('button', { name: 'Glint gate' }))
  expect(engine.controls.get().fmKeyGate).toBe(1)
  expect(
    screen.getByRole('button', { name: 'Glint gate', pressed: false }),
  ).toBeTruthy()
  act(() => engine.undo(0))
  expect(engine.controls.get().fmKeyGate).toBe(0)
})

test('the jumper lamp says off, wired, and sounding', () => {
  render(<MonoKeys />)
  const lamp = () =>
    screen
      .getByRole('button', { name: 'Growler gate' })
      .querySelector('[data-lamp]')
      ?.getAttribute('data-lamp')
  act(() => engine.set('monoKeyGate', 0))
  expect(lamp()).toBe('wired')
  act(() => {
    engine.chipNotes.set(new Set([60]))
    engine.monoNotes.set(new Set([48]))
  })
  expect(lamp()).toBe('sounding')
  act(() => engine.chipNotes.set(new Set()))
  expect(lamp()).toBe('wired')
  act(() => {
    engine.chipNotes.set(new Set([60]))
    engine.set('monoKeyGate', 1)
  })
  expect(lamp()).toBe('off')
  act(() => {
    engine.chipNotes.set(new Set())
    engine.monoNotes.set(new Set())
    engine.set('monoKeyGate', 0)
  })
})

// The bed arrives with the chip it plays. A board with the FM chip down is the
// board everyone had before there was a second keyboard, and it looks like it.
test('the FM bed is drawn once the chip is in the mix', () => {
  render(<App />)
  expect(screen.queryByRole('group', { name: 'glint' })).toBeNull()
  act(() => engine.set('fmLevel', 0.8))
  expect(screen.getByRole('group', { name: 'glint' })).toBeTruthy()
})

// One keyboard and two beds, so the box cannot just be empty: switching the
// letters off here is switching them on next door. The drawer stays open
// through it, which is what makes it a drawer of settings rather than a menu of
// commands.
test('turning the letters off one bed hands them to the other', () => {
  both()
  wireLetters('glint')
  fireEvent.click(bed('glint').getByRole('checkbox'))
  fireEvent.keyDown(window, { key: 'a' })
  expect(engine.keysDown.get().size).toBe(1)
  expect(engine.fmKeysDown.get().size).toBe(0)
})

test('a second press on ⋯ shuts the menu again', () => {
  both()
  press(more('plinky'))
  expect(bed('plinky').queryByRole('checkbox')).not.toBeNull()
  press(more('plinky'))
  expect(bed('plinky').queryByRole('checkbox')).toBeNull()
})

// Three octaves is twenty-two white keys, and a case narrow enough — a phone
// held upright, a window pulled in until the panel has taken most of it — draws
// them thin enough that a finger lands between two of them. The bed measures
// itself and draws one octave instead, and the switch that was always how you
// reached past the drawn keys is how you reach the ones it stopped drawing.
test('a case with no room for three octaves draws one', () => {
  render(<Keys />)
  const toy = () => bed('plinky')
  expect(toy().queryByRole('button', { name: 'key C6' })).not.toBeNull()

  act(() => measure(300))
  expect(toy().queryByRole('button', { name: 'key C6' })).toBeNull()
  expect(toy().queryByRole('button', { name: 'key C4' })).not.toBeNull()

  // The five caps are one stepper, and it still reaches what the long board
  // reached: two octaves up from a board that opens on C3 is one that closes on
  // C6.
  expect(toy().queryByRole('button', { name: '+2' })).toBeNull()
  fireEvent.click(toy().getByRole('button', { name: 'octave up' }))
  fireEvent.click(toy().getByRole('button', { name: 'octave up' }))
  expect(toy().queryByRole('button', { name: 'key C6' })).not.toBeNull()
  expect(toy().getByRole('button', { name: 'octave up' })).toHaveProperty(
    'disabled',
    true,
  )
})

// The board narrows under a note that is still sounding. Whatever was pinned
// down keeps playing off the end of the short bed — the arrow says so — and the
// hold switch still lets go of it, because what a bed holds is notes rather
// than the keys they were struck on.
test('a note held past the end of a shortened board can still be let go', () => {
  render(<Keys />)
  const toy = () => bed('plinky')
  fireEvent.click(toy().getByRole('button', { name: 'hold' }))
  const top = toy().getByRole('button', { name: 'key C5' })
  fireEvent.pointerDown(top)
  fireEvent.pointerUp(top)
  expect(engine.keysDown.get().size).toBe(1)

  act(() => measure(300))
  expect(toy().queryByRole('button', { name: 'key C5' })).toBeNull()
  fireEvent.click(toy().getByRole('button', { name: 'hold' }))
  expect(engine.keysDown.get().size).toBe(0)
})

// The same case, and the other thing that decides how much board goes in it. A
// key a pointer hits every time is one a thumb lands beside, so the width that
// holds three octaves for a mouse holds two for a finger — nothing about the
// window says which is on it.
test('a finger is given fewer keys than a pointer in the same case', () => {
  render(<Keys />)
  const toy = () => bed('plinky')
  act(() => measure(600))
  expect(toy().queryByRole('button', { name: 'key C6' })).not.toBeNull()

  act(() => touch(true))
  expect(toy().queryByRole('button', { name: 'key C6' })).toBeNull()
  expect(toy().queryByRole('button', { name: 'key C5' })).not.toBeNull()
})

test('a deck keeps its Level in the speaker cap at any width', () => {
  render(<Keys />)
  const toy = () => bed('plinky')
  const level = () => toy().queryByRole('slider', { name: 'Level' })
  expect(level()).toBeNull()

  act(() => measure(300))
  expect(level()).toBeNull()
  fireEvent.click(toy().getByRole('button', { name: 'volume Plinky' }))
  expect(level()).not.toBeNull()
})

test('a touch screen keeps no keyboard settings', () => {
  render(<Keys />)
  act(() => touch(true))
  press(more('plinky'))
  expect(bed('plinky').queryByRole('checkbox')).toBeNull()
})

test('a GATE cable runs from Plinky to the keyboard, and pulling the plug removes it', () => {
  const { container } = render(
    <>
      <GateBench>
        <Keys />
        <FmKeys />
      </GateBench>
    </>,
  )
  act(() => engine.set('fmKeyGate', 0))
  expect(container.querySelectorAll('[data-lamp="wired"]').length).toBe(2)
  const cables = () => container.querySelectorAll('path[class*=grab]')
  expect(cables().length).toBe(1)
  const grab = container.querySelector('path[class*=grab]')!
  fireEvent.click(grab)
  expect(cables().length).toBe(0)
  expect(engine.controls.get().fmKeyGate).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'Glint gate' }))
  expect(cables().length).toBe(1)
  expect(engine.controls.get().fmKeyGate).toBe(0)
})

test('dragging a cable end off its jack pulls the plug, and a cable from Plinky’s output plugs in where it lands', () => {
  const { container } = render(
    <GateBench>
      <Keys />
      <FmKeys />
    </GateBench>,
  )
  act(() => engine.set('fmKeyGate', 0))
  const input = screen.getByRole('button', { name: 'Glint gate' })
  const output = container.querySelector<HTMLElement>(
    '[data-jack="gate:out:plinky"]',
  )!
  const over = (el: Element | null) => {
    document.elementFromPoint = () => el
  }
  const drag = (from: Element, to: Element | null) => {
    fireEvent.pointerDown(from, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    over(to)
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
  }
  drag(input, document.body)
  expect(engine.controls.get().fmKeyGate).toBe(1)
  drag(output, input)
  expect(engine.controls.get().fmKeyGate).toBe(0)
  drag(output, document.body)
  expect(engine.controls.get().fmKeyGate).toBe(0)
  drag(input, input)
  expect(engine.controls.get().fmKeyGate).toBe(0)
  drag(input, document.body)
  drag(input, output)
  expect(engine.controls.get().fmKeyGate).toBe(0)
})

test('a GATE cable moves to whichever GATE jack its end lands on, the kit’s included', async () => {
  render(
    <GateBench>
      <Keys />
      <FmKeys />
      <PcmKeys />
      <DrumKit />
    </GateBench>,
  )
  act(() => {
    engine.set('fmKeyGate', 0)
    engine.set('pcmKeyGate', 1)
    engine.set('trigToDrum', 0)
  })
  const gate = (name: string) =>
    bed(name).getByRole('button', { name: /^\w+ gate$/ })
  const kit = () => screen.getByRole('button', { name: 'Clatter gate' })
  const drag = (from: Element, to: Element) => {
    fireEvent.pointerDown(from, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    document.elementFromPoint = () => to
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
  }

  drag(gate('glint'), gate('parlor'))
  expect(engine.controls.get().fmKeyGate).toBe(1)
  expect(engine.controls.get().pcmKeyGate).toBe(0)

  drag(gate('parlor'), kit())
  expect(engine.controls.get().pcmKeyGate).toBe(1)
  expect(engine.controls.get().trigToDrum).toBeGreaterThan(0)

  await new Promise(r => setTimeout(r, 0))
  fireEvent.click(kit())
  expect(engine.controls.get().trigToDrum).toBe(0)
})

test('the jacks carry printed names, and a TRIG jack names the voice in it', () => {
  render(
    <GateBench>
      <Keys />
      <FmKeys />
      <DrumKit />
    </GateBench>,
  )
  act(() => {
    engine.set('fmStruck', 1)
    engine.set('trigToKeys', 0)
  })
  expect(bed('glint').getByText('gate')).toBeTruthy()
  expect(bed('plinky').getByText('trig')).toBeTruthy()
  expect(bed('glint').getByText('kick')).toBeTruthy()
  expect(bed('glint').queryByText('trig')).toBeNull()
  expect(bed('glint').getByText('cv')).toBeTruthy()
  expect(bed('plinky').getByText('gate')).toBeTruthy()
  expect(bed('plinky').queryByText('kick')).toBeNull()
})

test('a cancelled cable drag puts the cable back and changes nothing', () => {
  const { container } = render(
    <GateBench>
      <Keys />
      <FmKeys />
    </GateBench>,
  )
  act(() => engine.set('fmKeyGate', 0))
  const bench = container.querySelector('[data-gate-bench]')!
  const input = screen.getByRole('button', { name: 'Glint gate' })
  const cancel = () => {
    fireEvent.pointerCancel(window)
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
  }
  const escape = () => {
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
    fireEvent.click(input)
  }
  for (const end of [cancel, escape]) {
    fireEvent.pointerDown(input, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    expect(bench.getAttribute('data-dragging')).toBe('true')
    end()
    expect(bench.getAttribute('data-dragging')).toBe('false')
    expect(engine.controls.get().fmKeyGate).toBe(0)
  }
})

test('a cable drag follows the pointer that picked it up and no other', () => {
  const { container } = render(
    <GateBench>
      <Keys />
      <FmKeys />
    </GateBench>,
  )
  act(() => engine.set('fmKeyGate', 0))
  const bench = container.querySelector('[data-gate-bench]')!
  const input = screen.getByRole('button', { name: 'Glint gate' })
  document.elementFromPoint = () => document.body
  fireEvent.pointerDown(input, { button: 0, pointerId: 1 })
  fireEvent.pointerMove(window, { pointerId: 2, clientX: 40, clientY: 40 })
  expect(bench.getAttribute('data-dragging')).toBe('false')
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 40, clientY: 40 })
  expect(bench.getAttribute('data-dragging')).toBe('true')
  fireEvent.pointerUp(window, { pointerId: 2, clientX: 40, clientY: 40 })
  expect(bench.getAttribute('data-dragging')).toBe('true')
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 40, clientY: 40 })
  expect(bench.getAttribute('data-dragging')).toBe('false')
  expect(engine.controls.get().fmKeyGate).toBe(1)
})

test('a TRIG cable patches a kit voice into a keyboard, and moves or pulls with a drag', async () => {
  await new Promise(r => setTimeout(r, 0))
  const { container } = render(
    <GateBench>
      <Keys />
      <FmKeys />
      <DrumKit />
    </GateBench>,
  )
  act(() => {
    engine.set('fmStruck', 0)
    engine.set('trigToKeys', 0)
  })
  const trig = (name: string) =>
    bed(name).getByRole('button', { name: /^\w+ trig$/ })
  const voice = (n: number) =>
    container.querySelector<HTMLElement>(`[data-jack="trig:out:${n}"]`)!
  const drag = (from: Element, to: Element) => {
    fireEvent.pointerDown(from, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    document.elementFromPoint = () => to
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
  }

  fireEvent.click(trig('glint'))
  expect(engine.controls.get().fmStruck).toBe(9)
  fireEvent.click(trig('glint'))
  expect(engine.controls.get().fmStruck).toBe(0)

  drag(voice(2), trig('glint'))
  expect(engine.controls.get().fmStruck).toBe(2)
  drag(trig('glint'), trig('plinky'))
  expect(engine.controls.get().fmStruck).toBe(0)
  expect(engine.controls.get().trigToKeys).toBe(2)
  drag(trig('plinky'), document.body)
  expect(engine.controls.get().trigToKeys).toBe(0)
  drag(trig('glint'), voice(1))
  expect(engine.controls.get().fmStruck).toBe(1)
})

test('an effect button on the toy runs while held and lets go on release', () => {
  const sfx = vi.spyOn(engine, 'sfx')
  render(<Keys />)
  const laser = bed('effect buttons').getByRole('button', { name: 'laser' })
  fireEvent.pointerDown(laser)
  expect(sfx).toHaveBeenLastCalledWith('toy', 0, true)
  expect(laser.getAttribute('aria-pressed')).toBe('true')
  fireEvent.pointerUp(laser)
  expect(sfx).toHaveBeenLastCalledWith('toy', 0, false)
  expect(laser.getAttribute('aria-pressed')).toBe('false')
  sfx.mockRestore()
})

test('an effect button on Glint runs its effect ROM script while held', () => {
  const sfx = vi.spyOn(engine, 'sfx')
  render(<FmKeys />)
  const surf = bed('effect buttons').getByRole('button', { name: 'surf' })
  fireEvent.pointerDown(surf)
  expect(sfx).toHaveBeenLastCalledWith('fm', 1, true)
  fireEvent.pointerUp(surf)
  expect(sfx).toHaveBeenLastCalledWith('fm', 1, false)
  sfx.mockRestore()
})

test('a MOD cable runs a patch bay source into a machine’s CV jack, and moves or pulls with a drag', async () => {
  await new Promise(r => setTimeout(r, 0))
  const { container } = render(
    <GateBench>
      <ModPlate />
      <Keys />
      <FmKeys />
      <MonoKeys />
    </GateBench>,
  )
  act(() => {
    for (const i of [0, 1, 2, 3] as const) engine.set(`mod${i}Src`, 0)
  })
  const cv = (name: string) =>
    screen.getByRole('button', { name: `${name} CV` })
  const lfo = container.querySelector<HTMLElement>(
    `[data-jack="mod:out:${LFO}"]`,
  )!
  const drag = (from: Element, to: Element) => {
    fireEvent.pointerDown(from, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    document.elementFromPoint = () => to
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
  }
  const into = (m: string) =>
    modCables(engine.controls.get()).filter(c => c.machine === m)

  drag(lfo, cv('Glint'))
  expect(into('Glint')).toMatchObject([{ src: LFO, dest: CV_DEST.Glint }])

  drag(cv('Glint'), cv('Growler'))
  expect(into('Glint')).toEqual([])
  expect(into('Growler')).toMatchObject([{ src: LFO }])

  drag(cv('Growler'), document.body)
  expect(into('Growler')).toEqual([])

  await new Promise(r => setTimeout(r, 0))
  fireEvent.click(cv('Plinky'))
  expect(into('Plinky')).toMatchObject([{ src: LFO, dest: CV_DEST.Plinky }])
  fireEvent.click(cv('Plinky'))
  expect(into('Plinky')).toEqual([])
})

test('the ADSR’s gate opens on held keys until a kit voice is patched in', async () => {
  await new Promise(r => setTimeout(r, 0))
  const { container } = render(
    <GateBench>
      <ModPlate />
      <Keys />
      <DrumKit />
    </GateBench>,
  )
  act(() => engine.set('modEnvGate', 0))
  const gate = () => screen.getByRole('button', { name: 'ADSR gate' })
  expect(gate().getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByText('keys')).toBeTruthy()

  const snare = container.querySelector<HTMLElement>(
    '[data-jack="trig:out:2"]',
  )!
  fireEvent.pointerDown(snare, { button: 0, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
  document.elementFromPoint = () => gate()
  fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
  expect(engine.controls.get().modEnvGate).toBe(3)

  await new Promise(r => setTimeout(r, 0))
  fireEvent.click(gate())
  expect(engine.controls.get().modEnvGate).toBe(0)
  fireEvent.click(gate())
  expect(engine.controls.get().modEnvGate).toBe(1)
})

test('a patched CV jack names where its cable lands, and picking another aims the wire there', () => {
  render(
    <GateBench>
      <Keys />
      <FmKeys />
    </GateBench>,
  )
  act(() => {
    for (const i of [0, 1, 2, 3] as const) engine.set(`mod${i}Src`, 0)
    engine.set('mod0Src', LFO)
    engine.set('mod0Dest', CV_DEST.Glint)
  })
  const pick = screen.getByRole('combobox', { name: 'Glint CV lands on' })
  expect(bed('glint').getByText('clock')).toBeTruthy()
  fireEvent.change(pick, { target: { value: String(DEST.fmLevel) } })
  expect(engine.controls.get().mod0Dest).toBe(DEST.fmLevel)
  expect(bed('glint').getByText('level')).toBeTruthy()
})

test('a MOD cable between two plates lays a path with no keyboard cable on the bench', () => {
  const { container } = render(
    <GateBench>
      <ModPlate />
      <DrumKit />
    </GateBench>,
  )
  act(() => {
    for (const i of [0, 1, 2, 3] as const) engine.set(`mod${i}Src`, 0)
    engine.set('mod0Src', LFO)
    engine.set('mod0Dest', CV_DEST.Clatter)
  })
  const paths = [...container.querySelectorAll('path[class*=core]')]
  expect(paths.length).toBe(1)
  expect(paths[0]!.getAttribute('d')).not.toMatch(/NaN|Infinity/)
})

test('a press on an output picks up a cable for the next input pressed', async () => {
  await new Promise(r => setTimeout(r, 0))
  render(
    <GateBench>
      <ModPlate />
      <Keys />
      <FmKeys />
      <MonoKeys />
    </GateBench>,
  )
  act(() => {
    for (const i of [0, 1, 2, 3] as const) engine.set(`mod${i}Src`, 0)
  })
  const jack = (name: string) => screen.getByRole('button', { name })
  const into = (m: string) =>
    modCables(engine.controls.get()).filter(c => c.machine === m)

  fireEvent.click(jack('ADSR out'))
  expect(jack('ADSR out').getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(jack('Glint CV'))
  expect(into('Glint')).toMatchObject([{ src: ADSR }])
  expect(jack('ADSR out').getAttribute('aria-pressed')).toBe('false')

  fireEvent.click(jack('ADSR out'))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(jack('ADSR out').getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(jack('Growler CV'))
  expect(into('Growler')).toMatchObject([{ src: LFO }])
})

test('a MOD source gives out no cable while all four bay wires are in use', () => {
  render(
    <GateBench>
      <ModPlate />
      <FmKeys />
    </GateBench>,
  )
  act(() => {
    for (const i of [0, 1, 2, 3] as const) {
      engine.set(`mod${i}Src`, LFO)
      engine.set(`mod${i}Dest`, CV_DEST.Glint)
    }
  })
  const adsr = screen.getByRole('button', { name: 'ADSR out' })
  expect(adsr.getAttribute('data-full')).toBe('true')
  fireEvent.click(adsr)
  expect(adsr.getAttribute('aria-pressed')).toBe('false')
})

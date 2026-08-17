import { expect, test } from 'vitest'
import { instance } from '@viz-js/viz'
import { readFileSync } from 'node:fs'
import { renderDiagrams } from '../../scripts/chain-svg'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { buildDot, buildMap, groupAnchor, PANEL } from './chain-dot'
import { GROUPS } from './controls'

const viz = await instance()

test('graphviz parses the default chain', () => {
  expect(
    viz.renderString(buildDot(DEFAULT_CONTROLS), { format: 'svg' }),
  ).toContain('<svg')
})

test('bend slots draw in their live order', () => {
  const dot = buildDot({
    ...DEFAULT_CONTROLS,
    bendSlot0: 5,
    bendSlot1: 1,
    bendSlot2: 0,
  })
  expect(dot).toContain('mix -> Glitch_buffer')
  expect(dot).toContain('Glitch_buffer -> Ring_mod')
})

test('a duplicated bend runs once, at its first slot', () => {
  const dot = buildDot({
    ...DEFAULT_CONTROLS,
    bendSlot0: 1,
    bendSlot1: 1,
    bendSlot2: 2,
  })
  expect(dot.match(/Ring_mod \[/g)).toHaveLength(1)
  expect(dot).toContain('Ring_mod -> Crusher')
})

test('the feedback bus stays on the map at zero, greyed out', () => {
  const dot = buildDot(DEFAULT_CONTROLS)
  expect(dot).toContain('out -> Feedback_bus')
  expect(dot).toContain(`color="${PANEL.dim}", style=dashed`)
  expect(viz.renderString(dot, { format: 'svg' })).toContain('<svg')
})

test('the feedback wire lands on its destination', () => {
  const toOsc = buildDot({ ...DEFAULT_CONTROLS, fbAmt: 0.4, fbDest: 1 })
  expect(toOsc).toContain('Feedback_bus -> sources:Chaos_osc')
  expect(toOsc).toContain(`color="${PANEL.accent2}", style=dashed`)
  expect(viz.renderString(toOsc, { format: 'svg' })).toContain('<svg')
})

test('nodes link to the anchors the panel renders', () => {
  expect(buildDot(DEFAULT_CONTROLS)).toContain(
    `URL="#${groupAnchor('Tape delay')}"`,
  )
})

test('the wires are doors too — feedback to the bus, a patch wire to the bay', () => {
  const dot = buildDot({
    ...DEFAULT_CONTROLS,
    fbAmt: 0.4,
    mod0Src: 5,
    mod0Dest: 6,
    mod0Depth: 0.8,
  })
  const fb = `URL="#${groupAnchor('Feedback bus')}"`
  expect(dot).toContain(
    `out -> Feedback_bus [color="${PANEL.accent2}", style=dashed, ${fb}`,
  )
  expect(dot.match(new RegExp(`Feedback_bus -> mix .*${fb}`))).toBeTruthy()
  expect(
    dot.match(
      new RegExp(`wire0 -> Tape_delay .*URL="#${groupAnchor('Patch bay')}"`),
    ),
  ).toBeTruthy()
})

test('touched controls show a count', () => {
  expect(
    buildDot({ ...DEFAULT_CONTROLS, ringMix: 0.5, ringHz: 100 }),
  ).toContain('Ring mod  2')
})

test('the sources ride one strip, each row linking to its group', () => {
  const dot = buildDot(DEFAULT_CONTROLS)
  expect(dot).toContain(`PORT="Chaos_osc" HREF="#${groupAnchor('Chaos osc')}"`)
  expect(dot).toContain('Noise &amp; crackle')
  expect(dot).toContain('sources -> mix')
})

test("the README's diagrams are what the chain draws today — else `pnpm diagram`", async () => {
  for (const [path, svg] of Object.entries(await renderDiagrams())) {
    expect(
      readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'),
    ).toBe(svg)
  }
})

test('the shifter draws when it is in a slot', () => {
  expect(buildDot({ ...DEFAULT_CONTROLS, bendSlot0: 7 })).toContain(
    'mix -> Freq_shifter',
  )
})

test('a patch wire draws onto the group it is soldered to', () => {
  expect(buildDot(DEFAULT_CONTROLS)).not.toContain('wire0')
  const wired = buildDot({
    ...DEFAULT_CONTROLS,
    mod0Src: 5,
    mod0Dest: 6,
    mod0Depth: 0.8,
  })
  expect(wired).toContain('label="body X"')
  expect(wired).toContain('wire0 -> Tape_delay')
  expect(viz.renderString(wired, { format: 'svg' })).toContain('<svg')
})

test('a wire onto a stage that is not in the path is left undrawn', () => {
  const dot = buildDot({
    ...DEFAULT_CONTROLS,
    bendSlot4: 0,
    mod0Src: 1,
    mod0Dest: 2,
    mod0Depth: 1,
  })
  expect(dot).not.toContain('wire0')
})

// The map is the panel's only index, so a group with no door on it is a group
// with no way in. Boards that push the drawing about: nothing patched, an empty
// bend rack, and a board with both wires soldered.
const BOARDS: Record<string, Controls> = {
  stock: DEFAULT_CONTROLS,
  bare: {
    ...DEFAULT_CONTROLS,
    bendSlot0: 0,
    bendSlot1: 0,
    bendSlot2: 0,
    bendSlot3: 0,
    bendSlot4: 0,
    bendSlot5: 0,
  },
  bridged: { ...DEFAULT_CONTROLS, trigToKeys: 7, trigToDrum: 1 },
  wired: {
    ...DEFAULT_CONTROLS,
    tapeMix: 0.5,
    mod0Src: 5,
    mod0Dest: 6,
    mod0Depth: 0.8,
    mod1Src: 1,
    mod1Dest: 0,
    mod1Depth: 0.4,
  },
}

// A door the map claims but never draws is worse than no door at all: the panel
// shelves what the doors leave out, so the group would go missing from both.
test.each(Object.entries(BOARDS))('every door is drawn: %s', (_, board) => {
  const { dot, doors } = buildMap(board, { wrap: true })
  const names = new Set(GROUPS.map(g => g.name))
  for (const name of doors) {
    expect(names).toContain(name)
    expect(dot).toContain(`#${groupAnchor(name)}`)
  }
  expect(viz.renderString(dot, { format: 'svg' })).toContain('<svg')
})

test('the doors are what the path reaches, and only that', () => {
  const { doors } = buildMap(DEFAULT_CONTROLS)
  expect(doors).toContain('Tape machine')
  expect(doors).toContain('Ring mod')
  expect(doors).not.toContain('Freq shifter')
  expect(doors).not.toContain('Slot order')
  expect(doors).not.toContain('Body contact')
})

test('a slotted bend leaves the shelf', () => {
  expect(buildMap({ ...DEFAULT_CONTROLS, bendSlot0: 7 }).doors).toContain(
    'Freq shifter',
  )
})

test('an empty rack says so in the path, and opens the slot order', () => {
  const { dot, doors } = buildMap(BOARDS.bare!)
  expect(dot).toContain(`no_bends [label="no bends patched"`)
  expect(dot).toMatch(new RegExp(`no_bends \\[.*#${groupAnchor('Slot order')}`))
  expect(doors).toContain('Slot order')
})

test('a wire label opens what it picks up, the wire itself the bay', () => {
  const dot = buildDot({
    ...DEFAULT_CONTROLS,
    mod0Src: 5,
    mod0Dest: 6,
    mod0Depth: 0.8,
  })
  expect(dot).toMatch(
    new RegExp(`wire0 \\[label="body X".*#${groupAnchor('Body contact')}`),
  )
  expect(dot).toMatch(
    new RegExp(`wire0 -> Tape_delay .*#${groupAnchor('Patch bay')}`),
  )
})

test('a bridged trigger line draws between the two boxes', () => {
  const stock = buildMap(DEFAULT_CONTROLS)
  expect(stock.dot).not.toContain('trigToKeys')
  expect(stock.doors).not.toContain('Trigger patch')

  const both = buildMap({ ...DEFAULT_CONTROLS, trigToKeys: 1, trigToDrum: 8 })
  expect(both.dot).toContain('label="kick trig"')
  expect(both.dot).toContain('trigToKeys -> sources:Toy_keyboard')
  expect(both.dot).toContain('label="the step trig"')
  expect(both.dot).toContain('trigToDrum -> sources:Toy_drums')
  expect(both.doors).toContain('Trigger patch')
  expect(viz.renderString(both.dot, { format: 'svg' })).toContain('<svg')
})

test('a wire off a trigger line opens the box it picks up from', () => {
  const dot = buildDot({
    ...DEFAULT_CONTROLS,
    mod0Src: 9,
    mod0Dest: 0,
    mod0Depth: 1,
    filtMix: 0.5,
  })
  expect(dot).toMatch(
    new RegExp(`wire0 \\[label="drum hit".*#${groupAnchor('Toy drums')}`),
  )
})

test('a wire onto the feedback amount draws onto the bus', () => {
  const dot = buildDot({
    ...DEFAULT_CONTROLS,
    mod0Src: 6,
    mod0Dest: 8,
    mod0Depth: 1,
  })
  expect(dot).toContain('wire0 -> Feedback_bus')
})

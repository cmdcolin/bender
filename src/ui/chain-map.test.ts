import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderDiagrams } from '../../scripts/chain-svg'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import {
  buildMap,
  drawMap,
  drawNode,
  groupAnchor,
  PANEL,
  type ChainMap,
} from './chain-map'
import { GROUPS } from './controls'
import { serialize } from './svg'

const hop = (map: ChainMap, from: string, to: string) =>
  map.wires.find(w => w.from === from && w.to === to)

const box = (map: ChainMap, id: string) => map.nodes.find(n => n.id === id)

// Every box lands inside the drawing, no two on the path overlap, and every
// wire starts somewhere and ends somewhere. A layout by hand has no solver to
// catch it putting a stage on top of another one, so the suite is the solver.
function checkLayout(map: ChainMap) {
  expect(map.width).toBeGreaterThan(0)
  for (const n of map.nodes) {
    expect(n.x).toBeGreaterThanOrEqual(0)
    expect(n.y).toBeGreaterThanOrEqual(0)
    expect(n.x + n.w).toBeLessThanOrEqual(map.width)
    expect(n.y + n.h).toBeLessThanOrEqual(map.height)
  }
  // Frames are left out: the toy board's whole job is to contain the three
  // boxes inside it, so it overlaps them on purpose.
  const boxes = map.nodes.filter(n => n.kind !== 'label' && n.kind !== 'frame')
  for (const [i, a] of boxes.entries())
    for (const b of boxes.slice(i + 1))
      expect(
        a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y,
      ).toBe(true)
  const ids = new Set(map.nodes.map(n => n.id))
  for (const w of map.wires) {
    expect(ids).toContain(w.from)
    expect(ids).toContain(w.to)
    expect(w.d).toMatch(/^M [\d.-]+ [\d.-]+/)
  }
}

test('the path is drawn, wired and inside its own box', () => {
  for (const wrap of [false, true]) {
    const map = buildMap(DEFAULT_CONTROLS, { wrap })
    checkLayout(map)
    expect(serialize(drawMap(map))).toContain('<svg')
  }
})

test('bend slots draw in their live order', () => {
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    bendSlot0: 5,
    bendSlot1: 1,
    bendSlot2: 0,
  })
  expect(hop(map, 'mix', 'Glitch_buffer')).toBeTruthy()
  expect(hop(map, 'Glitch_buffer', 'Ring_mod')).toBeTruthy()
})

test('a duplicated bend runs once, at its first slot', () => {
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    bendSlot0: 1,
    bendSlot1: 1,
    bendSlot2: 2,
  })
  expect(map.nodes.filter(n => n.id === 'Ring_mod')).toHaveLength(1)
  expect(hop(map, 'Ring_mod', 'Crusher')).toBeTruthy()
})

test('the feedback bus stays on the map at zero, greyed out', () => {
  const map = buildMap(DEFAULT_CONTROLS)
  expect(box(map, 'Feedback_bus')?.active).toBe(false)
  expect(hop(map, 'out', 'Feedback_bus')?.color).toBe(PANEL.dim)
})

test('the feedback wire lands on its destination', () => {
  const toOsc = buildMap({ ...DEFAULT_CONTROLS, fbAmt: 0.4, fbDest: 1 })
  const home = hop(toOsc, 'Feedback_bus', 'Chaos_osc')
  expect(home?.color).toBe(PANEL.accent2)
  expect(home?.label?.text).toBe('0.40')
  expect(hop(toOsc, 'Feedback_bus', 'mix')).toBeUndefined()
})

test('the wires are doors too — feedback to the bus, a patch wire to the bay', () => {
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    fbAmt: 0.4,
    mod0Src: 5,
    mod0Dest: 6,
    mod0Depth: 0.8,
  })
  expect(hop(map, 'out', 'Feedback_bus')?.door).toBe('Feedback bus')
  expect(hop(map, 'Feedback_bus', 'mix')?.door).toBe('Feedback bus')
  expect(hop(map, 'wire0', 'Tape_delay')?.door).toBe('Patch bay')
})

test('a box links to the anchor the panel renders, and the shelf does not', () => {
  const live = serialize(drawMap(buildMap(DEFAULT_CONTROLS)))
  expect(live).toContain(`href="#${groupAnchor('Tape delay')}"`)
  expect(live).toContain('data-door="Tape delay"')
  expect(
    serialize(drawMap(buildMap(DEFAULT_CONTROLS, { live: false }))),
  ).not.toContain('href=')
})

test('touched controls show a count', () => {
  const map = buildMap({ ...DEFAULT_CONTROLS, ringMix: 0.5, ringHz: 100 })
  expect(box(map, 'Ring_mod')?.count).toBe(2)
  expect(box(map, 'Ring_mod')?.w).toBeGreaterThan(0)
})

test('the open stage is lit, and nothing else is', () => {
  const map = buildMap(DEFAULT_CONTROLS, { open: 'Tape delay' })
  expect(box(map, 'Tape_delay')?.open).toBe(true)
  expect(map.nodes.filter(n => n.open)).toHaveLength(1)
})

test('each source is a box of its own, and a door of its own', () => {
  const map = buildMap(DEFAULT_CONTROLS)
  for (const name of ['Toy keyboard', 'FM chip', 'Chaos osc', 'Sampler'])
    expect(box(map, name.replace(/\W+/g, '_'))?.kind).toBe('inst')
  expect(hop(map, 'Chaos_osc', 'mix')).toBeTruthy()
  const svg = serialize(drawMap(map))
  expect(svg).toContain(`href="#${groupAnchor('Chaos osc')}"`)
  expect(svg).toContain('Noise &amp; crackle')
})

// The three chips share one supply and one key line, and the map says so with a
// frame round them and a wire between two of them — which is the whole reason
// the sources stopped being six alike rows.
test('the toy board frames its three chips, and wires the key line', () => {
  const map = buildMap(DEFAULT_CONTROLS)
  const frame = box(map, 'toy_board')!
  expect(frame.kind).toBe('frame')
  expect(frame.door).toBeUndefined()
  for (const id of ['Toy_keyboard', 'FM_chip', 'Toy_drums']) {
    const chip = box(map, id)!
    expect(chip.x).toBeGreaterThanOrEqual(frame.x)
    expect(chip.x + chip.w).toBeLessThanOrEqual(frame.x + frame.w)
  }
  // The bar is over the two boxes it can reach. The chip under one of them
  // takes the same supply and says so by being inside the frame.
  for (const id of ['Toy_keyboard', 'Toy_drums'])
    expect(hop(map, 'toy_board', id)?.color).toBe(PANEL.dim)
  expect(hop(map, 'toy_board', 'FM_chip')).toBeUndefined()
  // Soldered, so it is on the map whatever the board is set to — and it is the
  // warm colour, because a patched cable is the cool one.
  const key = hop(map, 'Toy_keyboard', 'FM_chip')!
  expect(key.color).toBe(PANEL.accent2)
  expect(key.dash).toBeUndefined()
  expect(key.label?.text).toBe('key')
})

// The pairing is the point: the two machines you play are one row at one width,
// and the chip with no keyboard of its own hangs under the keyboard on the key
// line rather than standing beside them as a third peer.
test('the two toys pair across the top, with the FM chip set in under one', () => {
  const map = buildMap(DEFAULT_CONTROLS)
  const keys = box(map, 'Toy_keyboard')!
  const drums = box(map, 'Toy_drums')!
  const fm = box(map, 'FM_chip')!
  expect(keys.y).toBe(drums.y)
  expect(keys.w).toBeCloseTo(drums.w)
  expect(keys.x + keys.w).toBeLessThanOrEqual(drums.x)
  // Under the keyboard, inside its column, and inset from its left edge.
  expect(fm.y).toBeGreaterThan(keys.y + keys.h)
  expect(fm.x).toBeGreaterThan(keys.x)
  expect(fm.x + fm.w).toBeCloseTo(keys.x + keys.w)
})

// A bridge you patch runs across the lane the key line drops through, so the
// chip has to move down out of its way rather than be drawn over.
test('a patched trigger bridge pushes the FM chip clear of it', () => {
  const plain = buildMap(DEFAULT_CONTROLS)
  const bridged = buildMap({ ...DEFAULT_CONTROLS, trigToKeys: 1 })
  expect(box(bridged, 'FM_chip')!.y).toBeGreaterThan(box(plain, 'FM_chip')!.y)
  const trig = hop(bridged, 'Toy_drums', 'Toy_keyboard')!
  expect(trig.color).toBe(PANEL.mod)
  expect(box(bridged, 'FM_chip')!.y).toBeGreaterThan(
    box(bridged, 'Toy_keyboard')!.y + box(bridged, 'Toy_keyboard')!.h,
  )
})

test('a source box carries how far up its fader is, on its own travel', () => {
  const level = (c: Controls, id: string) => box(buildMap(c), id)!.level
  expect(level(DEFAULT_CONTROLS, 'Toy_keyboard')).toBeCloseTo(
    DEFAULT_CONTROLS.chipLevel,
  )
  expect(box(buildMap(DEFAULT_CONTROLS), 'FM_chip')!.active).toBe(false)
  // The sampler's fader goes to 2 and the chip's to 1, so half up reads as half
  // up on both rather than as twice as loud on one.
  expect(level({ ...DEFAULT_CONTROLS, sampleLevel: 1 }, 'Sampler')).toBeCloseTo(
    0.5,
  )
})

// Every source draws its own glyph, and the one that is running draws it in the
// warm colour — which is the only thing on the box that says so since the run
// lamp became the glyph itself.
test('each source box carries its own glyph, lit while it plays', () => {
  const map = buildMap(DEFAULT_CONTROLS, { playing: ['Toy drums'] })
  const insts = map.nodes.filter(n => n.kind === 'inst')
  expect(insts.filter(n => n.playing).map(n => n.label)).toEqual(['Toy drums'])
  for (const n of insts) {
    const svg = serialize(drawNode(n, PANEL, false))
    expect(svg).toContain('class="glyph"')
    expect(svg.includes(PANEL.accent2)).toBe(n.playing === true)
  }
})

// The mic is the one source that does not have to reach the mix: six of its
// seven settings solder it into the middle of something else.
test('the mic draws as a wire onto wherever it is patched', () => {
  expect(box(buildMap(DEFAULT_CONTROLS), 'mic')).toBeUndefined()
  const toMix = buildMap({ ...DEFAULT_CONTROLS, micLevel: 1 })
  expect(hop(toMix, 'mic', 'mix')).toBeTruthy()
  expect(toMix.doors).toContain('Mic')
  const toRail = buildMap({ ...DEFAULT_CONTROLS, micLevel: 1, micPatch: 1 })
  expect(hop(toRail, 'mic', 'Toy_keyboard')).toBeTruthy()
  expect(box(toRail, 'mic')?.door).toBe('Mic')
})

// The count is the way back as well as the reading, everywhere it is drawn: on
// a stage of the path, on a source in the rack, and on a part on the shelf,
// which the panel draws itself.
test('a stage off stock draws its count as the button that puts it back', () => {
  const board = { ...DEFAULT_CONTROLS, ringMix: 0.5, chipStarve: 0.3 }
  const svg = serialize(drawMap(buildMap(board)))
  expect(svg).toContain('data-reset="Ring mod"')
  expect(svg).toContain('data-reset="Toy keyboard"')
  expect(svg).not.toContain('data-reset="Crusher"')
  // The README's copy takes no clicks at all, so it draws none of them.
  expect(serialize(drawMap(buildMap(board, { live: false })))).not.toContain(
    'data-reset',
  )
})

test("the README's diagrams are what the chain draws today — else `pnpm diagram`", () => {
  for (const [path, svg] of Object.entries(renderDiagrams())) {
    expect(
      readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'),
    ).toBe(svg)
  }
})

test('the shifter draws when it is in a slot', () => {
  expect(
    hop(buildMap({ ...DEFAULT_CONTROLS, bendSlot0: 7 }), 'mix', 'Freq_shifter'),
  ).toBeTruthy()
})

test('a patch wire draws onto the group it is soldered to', () => {
  expect(box(buildMap(DEFAULT_CONTROLS), 'wire0')).toBeUndefined()
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    mod0Src: 5,
    mod0Dest: 6,
    mod0Depth: 0.8,
  })
  expect(box(map, 'wire0')?.label).toBe('body X 0.80')
  expect(hop(map, 'wire0', 'Tape_delay')).toBeTruthy()
  checkLayout(map)
})

test('a wire onto a stage that is not in the path is left undrawn', () => {
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    bendSlot4: 0,
    mod0Src: 1,
    mod0Dest: 2,
    mod0Depth: 1,
  })
  expect(box(map, 'wire0')).toBeUndefined()
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
  loaded: {
    ...DEFAULT_CONTROLS,
    fbAmt: 0.5,
    fbDest: 3,
    trigToKeys: 1,
    trigToDrum: 8,
    mod0Src: 5,
    mod0Dest: 6,
    mod0Depth: 0.8,
    mod1Src: 1,
    mod1Dest: 0,
    mod1Depth: 0.4,
    mod2Src: 6,
    mod2Dest: 8,
    mod2Depth: 0.3,
    mod3Src: 9,
    mod3Dest: 4,
    mod3Depth: 0.9,
  },
}

// A door the map claims but never draws is worse than no door at all: the panel
// shelves what the doors leave out, so the group would go missing from both.
test.each(Object.entries(BOARDS))('every door is drawn: %s', (_, board) => {
  const map = buildMap(board, { wrap: true })
  const names = new Set(GROUPS.map(g => g.name))
  const svg = serialize(drawMap(map))
  for (const name of map.doors) {
    expect(names).toContain(name)
    expect(svg).toContain(`#${groupAnchor(name)}`)
  }
  checkLayout(map)
})

test.each(Object.entries(BOARDS))(
  'the drawing holds together: %s',
  (_, board) => checkLayout(buildMap(board, { wrap: false })),
)

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
  const map = buildMap(BOARDS.bare!)
  expect(box(map, 'no_bends')?.door).toBe('Slot order')
  expect(map.doors).toContain('Slot order')
})

test('a wire label opens what it picks up, the wire itself the bay', () => {
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    mod0Src: 5,
    mod0Dest: 6,
    mod0Depth: 0.8,
  })
  expect(box(map, 'wire0')?.door).toBe('Body contact')
  expect(hop(map, 'wire0', 'Tape_delay')?.door).toBe('Patch bay')
})

test('a bridged trigger line draws between the two boxes', () => {
  const stock = buildMap(DEFAULT_CONTROLS)
  expect(hop(stock, 'Toy_drums', 'Toy_keyboard')).toBeUndefined()
  expect(stock.doors).not.toContain('Trigger patch')

  const both = buildMap({ ...DEFAULT_CONTROLS, trigToKeys: 1, trigToDrum: 8 })
  const up = hop(both, 'Toy_drums', 'Toy_keyboard')!
  const down = hop(both, 'Toy_keyboard', 'Toy_drums')!
  expect(up.label?.text).toBe('kick trig')
  expect(down.label?.text).toBe('the step trig')
  // Patched rather than soldered, so it draws in the patch colour and dashed —
  // the key line beside it is neither.
  expect(up.color).toBe(PANEL.mod)
  expect(up.dash).toBeTruthy()
  expect(up.door).toBe('Trigger patch')
  expect(both.doors).toContain('Trigger patch')
})

test('a wire off a trigger line opens the box it picks up from', () => {
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    mod0Src: 9,
    mod0Dest: 0,
    mod0Depth: 1,
    filtMix: 0.5,
  })
  expect(box(map, 'wire0')?.label).toContain('drum hit')
  expect(box(map, 'wire0')?.door).toBe('Toy drums')
})

test('a wire onto the feedback amount draws onto the bus', () => {
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    mod0Src: 6,
    mod0Dest: 8,
    mod0Depth: 1,
  })
  expect(hop(map, 'wire0', 'Feedback_bus')).toBeTruthy()
})

// The fold is the whole reason the panel gets a map it can read: two columns
// that come out roughly as tall as each other, rather than one 500px ribbon.
test('the fold halves the drawing and hands the path across', () => {
  const straight = buildMap(DEFAULT_CONTROLS, { wrap: false })
  const folded = buildMap(DEFAULT_CONTROLS, { wrap: true })
  // The source band is the same height either way, so the fold can only halve
  // what is under it — which is still most of the drawing.
  expect(folded.height).toBeLessThan(straight.height * 0.75)
  expect(folded.width).toBeGreaterThanOrEqual(straight.width)
  const fold = folded.wires.find(w => w.id === 'fold')!
  expect(fold.color).toBe(PANEL.accent)
  expect(box(folded, fold.to)!.x).toBeGreaterThan(box(folded, fold.from)!.x)
})

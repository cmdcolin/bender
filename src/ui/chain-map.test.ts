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
import { BENDS, GROUPS } from './controls'
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
    // A label is anchored text and not a box: its x is the point the text is
    // hung from, and which part of the text that is depends on the anchor —
    // start hangs the left edge there, end the right, and the default, middle,
    // the centre. Read as a left edge whatever the anchor, two of the three
    // report an edge no glyph is ever painted at, and the check passes or fails
    // on how wide the word happens to be rather than on where it sits.
    const left =
      n.kind !== 'label'
        ? n.x
        : n.anchor === 'start'
          ? n.x
          : n.anchor === 'end'
            ? n.x - n.w
            : n.x - n.w / 2
    expect(left).toBeGreaterThanOrEqual(0)
    expect(n.y).toBeGreaterThanOrEqual(0)
    expect(left + n.w).toBeLessThanOrEqual(map.width)
    expect(n.y + n.h).toBeLessThanOrEqual(map.height)
  }
  // Frames and chips are left out: the toy board's whole job is to contain the
  // three boxes inside it, and the rack's is to carry the bends in none of its
  // slots, so both overlap what they hold on purpose.
  const inside = new Set(['label', 'frame', 'chip'])
  const boxes = map.nodes.filter(n => !inside.has(n.kind))
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

test('bend slots draw in their live order, under the rack they sit in', () => {
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    bendSlot0: 5,
    bendSlot1: 1,
    bendSlot2: 0,
  })
  expect(hop(map, 'mix', 'rack')).toBeTruthy()
  expect(hop(map, 'rack', 'Glitch_buffer')).toBeTruthy()
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
  // The lip opens the parts the outline is round — the ones that are hardware
  // rather than a stage, and so have no box of their own — and is named for
  // them, the way every other door on the drawing is named for what it opens.
  expect(frame.door).toBe('Board parts')
  expect(frame.label).toBe('board parts')
  for (const id of ['Toy_keyboard', 'FM_chip', 'Toy_drums']) {
    const chip = box(map, id)!
    expect(chip.x).toBeGreaterThanOrEqual(frame.x)
    expect(chip.x + chip.w).toBeLessThanOrEqual(frame.x + frame.w)
  }
  // The bar drops onto all three, which is what one supply means. It reached
  // only two while the chip sat under the keyboard rather than beside it, and
  // being inside the frame was what said the chip took the supply too.
  for (const id of ['Toy_keyboard', 'FM_chip', 'Toy_drums'])
    expect(hop(map, 'toy_board', id)?.color).toBe(PANEL.dim)
  // Soldered, so it is on the map whatever the board is set to — and it is the
  // warm colour, because a patched cable is the cool one.
  const key = hop(map, 'Toy_keyboard', 'FM_chip')!
  expect(key.color).toBe(PANEL.accent2)
  expect(key.dash).toBeUndefined()
  expect(key.label?.text).toBe('key')
})

// One row of three, and which one the chip stands next to is the whole of what
// the drawing has left to say about the key line: it is soldered to the
// keyboard's gate and to nothing else, so it sits against the keyboard and the
// drums sit the far side of it.
test('the three chips make one row, the FM chip against the keyboard', () => {
  const map = buildMap(DEFAULT_CONTROLS)
  const keys = box(map, 'Toy_keyboard')!
  const drums = box(map, 'Toy_drums')!
  const fm = box(map, 'FM_chip')!
  expect(fm.y).toBe(keys.y)
  expect(drums.y).toBe(keys.y)
  expect(keys.x + keys.w).toBeLessThanOrEqual(fm.x)
  expect(fm.x + fm.w).toBeLessThanOrEqual(drums.x)
  // By its label and not the row's: the one you do not play should not come out
  // the size of the two you do.
  expect(fm.w).toBeLessThan(keys.w)
})

// A bridge you patch runs across the lane under the row, and the frame has to
// grow to hold it rather than draw over it.
test('a patched trigger bridge deepens the board rather than crossing it', () => {
  const plain = buildMap(DEFAULT_CONTROLS)
  const bridged = buildMap({ ...DEFAULT_CONTROLS, trigToKeys: 1 })
  expect(box(bridged, 'toy_board')!.h).toBeGreaterThanOrEqual(
    box(plain, 'toy_board')!.h,
  )
  const trig = hop(bridged, 'Toy_drums', 'Toy_keyboard')!
  expect(trig.color).toBe(PANEL.mod)
  // The row itself does not move: the lane is under it, and what is in the lane
  // is what the frame grows for.
  expect(box(bridged, 'FM_chip')!.y).toBe(box(plain, 'FM_chip')!.y)
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
// seven settings solder it into the middle of something else. Turned right
// down it is still soldered there, so it stays on the map greyed rather than
// leaving the panel with no way in — the rule the feedback bus already follows.
test('the mic draws as a wire onto wherever it is patched', () => {
  const off = buildMap(DEFAULT_CONTROLS)
  expect(box(off, 'mic')?.label).toBe('mic')
  expect(box(off, 'mic')?.active).toBe(false)
  expect(hop(off, 'mic', 'mix')?.color).toBe(PANEL.dim)
  expect(off.doors).toContain('Mic')
  const toMix = buildMap({ ...DEFAULT_CONTROLS, micLevel: 1 })
  expect(box(toMix, 'mic')?.label).toBe('mic 1.00')
  expect(hop(toMix, 'mic', 'mix')?.color).toBe(PANEL.mod)
  const toRail = buildMap({ ...DEFAULT_CONTROLS, micLevel: 1, micPatch: 1 })
  expect(hop(toRail, 'mic', 'Toy_keyboard')).toBeTruthy()
  expect(box(toRail, 'mic')?.door).toBe('Mic')
})

// Soldered onto a bend in none of the slots, the wire has somewhere to go all
// the same: in through the rack's edge, onto the chip riding in it — greyed,
// because nothing runs through what it is soldered to.
test('a mic on a bend that is in no slot lands on it in the rack', () => {
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    micLevel: 0.5,
    micPatch: 4,
    bendSlot0: 0,
  })
  expect(box(map, 'Ring_mod')?.kind).toBe('chip')
  expect(hop(map, 'mic', 'Ring_mod')?.color).toBe(PANEL.dim)
  expect(box(map, 'mic')?.active).toBe(false)
  // The label still hangs in the gutter, off the box the wire goes in through.
  expect(box(map, 'mic')!.x).toBeLessThan(box(map, 'rack')!.x)
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

// Six slots and seven bends, so one is always in none of them. The rack heads
// the run and carries those, each a door of its own — which is what stops a
// stage that is on the board and not in the path from going missing off the map.
test('the rack heads the run and carries the bends in no slot', () => {
  const map = buildMap({ ...DEFAULT_CONTROLS, bendSlot0: 7 })
  expect(box(map, 'rack')?.door).toBe('Slot order')
  expect(hop(map, 'rack', 'Freq_shifter')).toBeTruthy()
  const ring = box(map, 'Ring_mod')!
  expect(ring.kind).toBe('chip')
  expect(ring.door).toBe('Ring mod')
  expect(map.doors).toContain('Ring mod')
  // Inside the rack, which is the only place a box may sit over another one.
  const rack = box(map, 'rack')!
  expect(ring.y).toBeGreaterThan(rack.y)
  expect(ring.y + ring.h).toBeLessThanOrEqual(rack.y + rack.h)
})

// The one part of the drawing the solder rewrites is the rack — the joints
// under the slots open mid-note and the board re-solders two of them behind
// your back — so that is the row it reads off. It draws as a chip, because
// everything else you can press in that box does, and it sits at the far side
// of the name row from the count, which is the button that empties the slots.
test('the rack row carries the solder under its slots', () => {
  const solder = box(buildMap(DEFAULT_CONTROLS), 'solder')!
  expect(solder.door).toBe('Solder')
  expect(solder.kind).toBe('chip')
  const rack = box(buildMap(DEFAULT_CONTROLS), 'rack')!
  expect(solder.x + solder.w).toBeLessThan(rack.x + rack.w / 2)
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

// The map is the panel's only index, and the shelf under it is what a drawing
// that missed something looks like. Nothing on the board is off it now: the
// rack carries the bends in none of its slots, the lane under the toys says
// when nothing is bridged, the frame's lip opens the parts inside it, the mic
// draws at any level, and the bay and the pad sit at the foot with the loom.
test.each(Object.entries(BOARDS))('every group has a door: %s', (_, board) => {
  const { doors } = buildMap(board, { wrap: true })
  for (const g of GROUPS) expect(doors).toContain(g.name)
})

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

// What is in a slot is a stage of the path; what is in none of them is a chip
// in the rack. Every bend is one or the other, whatever the slots are set to.
test('a bend is a stage of the path or a chip in the rack, never neither', () => {
  for (const board of Object.values(BOARDS)) {
    const map = buildMap(board)
    for (const bend of BENDS) {
      const drawn = box(map, bend.group.replace(/\W+/g, '_'))!
      expect(['stage', 'chip']).toContain(drawn.kind)
    }
  }
})

test('an empty rack says so in the path, and every bend rides in it', () => {
  const map = buildMap(BOARDS.bare!)
  const rack = box(map, 'rack')!
  expect(rack.label).toBe('no bends patched')
  expect(rack.door).toBe('Slot order')
  // Every bend, and only the bends: the rack's own doors are chips too.
  const bends = new Set<string>(BENDS.map(b => b.group))
  expect(
    map.nodes.filter(n => n.kind === 'chip' && bends.has(n.door ?? '')),
  ).toHaveLength(BENDS.length)
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
  // Nothing bridged, so the lane the bridges would run across says so rather
  // than the part coming off the map — as a chip, because it is a door and the
  // drawing keeps its plain captions in plain text.
  const note = box(stock, 'no_trig')!
  expect(note.door).toBe('Trigger patch')
  expect(note.kind).toBe('chip')

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
  expect(box(both, 'no_trig')).toBeUndefined()
})

// The bay and the pad are bolted to the board whether or not you have patched
// anything, the same as the feedback bus, so they sit at the foot of the
// drawing — where everything that goes round the path rather than along it is —
// with the one wire between them, since the pad reaches the board through the
// bay and nowhere else.
test('the bay and the pad sit at the foot, greyed until a wire is in one', () => {
  const off = buildMap(DEFAULT_CONTROLS)
  expect(box(off, 'Patch_bay')?.active).toBe(false)
  expect(box(off, 'Body_contact')?.active).toBe(false)
  expect(hop(off, 'Body_contact', 'Patch_bay')?.color).toBe(PANEL.dim)
  expect(box(off, 'Patch_bay')!.y).toBeGreaterThan(box(off, 'Feedback_bus')!.y)

  const wired = buildMap({
    ...DEFAULT_CONTROLS,
    mod0Src: 5,
    mod0Dest: 6,
    mod0Depth: 0.8,
  })
  expect(box(wired, 'Patch_bay')?.active).toBe(true)
  expect(box(wired, 'Body_contact')?.active).toBe(true)
  expect(hop(wired, 'Body_contact', 'Patch_bay')?.color).toBe(PANEL.mod)
})

// A wire onto another wire's depth lands in the bay rather than on any stage,
// which used to be a wire the map could not draw at all.
test("a wire onto another wire's depth draws onto the bay itself", () => {
  const map = buildMap({
    ...DEFAULT_CONTROLS,
    mod0Src: 1,
    mod0Dest: 18,
    mod0Depth: 0.5,
  })
  expect(hop(map, 'wire0', 'Patch_bay')).toBeTruthy()
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

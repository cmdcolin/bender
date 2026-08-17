import { expect, test } from 'vitest'
import { instance } from '@viz-js/viz'
import { readFileSync } from 'node:fs'
import { renderDiagrams } from '../../scripts/chain-svg'
import { DEFAULT_CONTROLS } from '../controls'
import { buildDot, groupAnchor } from './chain-dot'

const viz = await instance()

test('graphviz parses the default chain', () => {
  expect(viz.renderString(buildDot(DEFAULT_CONTROLS), { format: 'svg' })).toContain('<svg')
})

test('bend slots draw in their live order', () => {
  const dot = buildDot({ ...DEFAULT_CONTROLS, bendSlot0: 5, bendSlot1: 1, bendSlot2: 0 })
  expect(dot).toContain('mix -> Glitch_buffer')
  expect(dot).toContain('Glitch_buffer -> Ring_mod')
})

test('a duplicated bend runs once, at its first slot', () => {
  const dot = buildDot({ ...DEFAULT_CONTROLS, bendSlot0: 1, bendSlot1: 1, bendSlot2: 2 })
  expect(dot.match(/Ring_mod \[/g)).toHaveLength(1)
  expect(dot).toContain('Ring_mod -> Crusher')
})

test('the feedback wire appears only when the bus is up, and lands on its destination', () => {
  expect(buildDot(DEFAULT_CONTROLS)).not.toContain('Feedback_bus')
  const toOsc = buildDot({ ...DEFAULT_CONTROLS, fbAmt: 0.4, fbDest: 1 })
  expect(toOsc).toContain('Feedback_bus -> sources:Chaos_osc')
  expect(viz.renderString(toOsc, { format: 'svg' })).toContain('<svg')
})

test('nodes link to the anchors the panel renders', () => {
  expect(buildDot(DEFAULT_CONTROLS)).toContain(`URL="#${groupAnchor('Tape delay')}"`)
})

test('touched controls show a count', () => {
  expect(buildDot({ ...DEFAULT_CONTROLS, ringMix: 0.5, ringHz: 100 })).toContain('Ring mod  2')
})

test('the sources ride one strip, each row linking to its group', () => {
  const dot = buildDot(DEFAULT_CONTROLS)
  expect(dot).toContain(`PORT="Chaos_osc" HREF="#${groupAnchor('Chaos osc')}"`)
  expect(dot).toContain('Noise &amp; crackle')
  expect(dot).toContain('sources -> mix')
})

test("the README's diagrams are what the chain draws today — else `pnpm diagram`", async () => {
  for (const [path, svg] of Object.entries(await renderDiagrams())) {
    expect(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')).toBe(svg)
  }
})

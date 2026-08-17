import { expect, test } from 'vitest'
import { instance } from '@viz-js/viz'
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
  expect(toOsc).toContain('Feedback_bus -> Chaos_osc')
  expect(viz.renderString(toOsc, { format: 'svg' })).toContain('<svg')
})

test('nodes link to the anchors the panel renders', () => {
  expect(buildDot(DEFAULT_CONTROLS)).toContain(`URL="#${groupAnchor('Tape delay')}"`)
})

test('touched controls show a count', () => {
  expect(buildDot({ ...DEFAULT_CONTROLS, ringMix: 0.5, ringHz: 100 })).toContain('Ring mod  2')
})

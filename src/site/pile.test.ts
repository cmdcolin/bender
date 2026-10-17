import { expect, test } from 'vitest'

import { pile } from './pile.ts'

test('the same seed draws the same heap, and another seed a different one', () => {
  expect(pile(5)).toBe(pile(5))
  expect(pile(5)).not.toBe(pile(6))
})

test('the heap is one labelled svg of flat colour with no stray numbers', () => {
  const svg = pile()
  expect(svg.startsWith('<svg ')).toBe(true)
  expect(svg).toContain('role="img"')
  expect(svg).toMatch(/aria-label="[^"]+"/)
  expect(svg).not.toMatch(/Gradient|filter|NaN|undefined/)
})

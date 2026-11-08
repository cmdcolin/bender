import { expect, test } from 'vitest'

import { pile } from './pile.ts'

test('the same seed draws the same heap, and another seed a different one', () => {
  expect(pile(5)).toBe(pile(5))
  expect(pile(5)).not.toBe(pile(6))
})

test('the heap is one decorative svg of flat colour with no stray numbers', () => {
  const svg = pile()
  expect(svg.startsWith('<svg ')).toBe(true)
  expect(svg).toContain('aria-hidden="true"')
  expect(svg).not.toMatch(/Gradient|filter|NaN|undefined/)
})

test('every shadow falls down and to the right, whichever way its thing turned', () => {
  for (const seed of [1, 2, 3, 4]) {
    const offsets = [
      ...pile(seed).matchAll(
        /<g transform="translate\(([-\d.]+) ([-\d.]+)\)" opacity="0\.[34]">/g,
      ),
    ]
    expect(offsets.length).toBeGreaterThan(40)
    for (const [, x, y] of offsets) {
      expect(Number(x)).toBeGreaterThan(0)
      expect(Number(y)).toBeGreaterThan(Number(x))
    }
  }
})

test('cables plug into jacks and clip onto leads', () => {
  const svg = pile()
  expect(svg).toMatch(/rect x="0" y="-6" width="4" height="12"/)
  expect(svg).toContain('class="pad0"')
  for (const hook of ['lit0', 'cone', 'hub', 'needle'])
    expect(svg).toContain(`class="${hook}"`)
})

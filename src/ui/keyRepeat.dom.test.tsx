// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { BottleFace } from './BottleFace.tsx'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import { SheetFace } from './SheetFace.tsx'
import { strikes } from './strikes.ts'
import './testDom.ts'

const hold = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key })
  fireEvent.keyDown(el, { key, repeat: true })
}

test.each([
  ['sheet', 'hit the sheet', () => <SheetFace />],
  ['bottle', 'tap the bottle', () => <BottleFace />],
] as const)('a held key hits the %s once', (target, name, face) => {
  render(face())
  const before = strikes.get()[target].length
  hold(screen.getByRole('button', { name }), 'Enter')
  expect(strikes.get()[target].length - before).toBe(1)
})

test('a held key opens a drawing box and leaves it open', () => {
  const wraith = GROUPS.find(g => g.name === 'Wraith')
  expect(wraith).toBeDefined()
  if (wraith) {
    render(<OpenGroup group={wraith} onClose={() => {}} seconds={0} />)
    const box = screen.getByRole('button', { name: 'heads controls' })
    hold(box, ' ')
    expect(box.getAttribute('aria-pressed')).toBe('true')
  }
})

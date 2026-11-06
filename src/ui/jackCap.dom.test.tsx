// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { jackFor } from '../jacks.ts'
import { JackCap } from './JackCap.tsx'
import './testDom.ts'

test('the unit menu checks the one line the unit is patched into', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, combInto: jackFor('toyDrum') })
  render(<JackCap stage="Comb" />)
  fireEvent.click(screen.getByRole('button', { name: 'patch Comb into' }))
  const items = screen.getAllByRole('menuitemradio', { hidden: true })
  expect(items.length).toBeGreaterThan(2)
  expect(items.filter(i => i.getAttribute('aria-checked') === 'true')).toEqual([
    screen.getByRole('menuitemradio', { name: 'Clatter', hidden: true }),
  ])
})

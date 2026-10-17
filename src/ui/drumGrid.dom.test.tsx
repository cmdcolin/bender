// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { GRID_ROWS } from '../drums.ts'
import { engine } from '../engine/engine.ts'
import styles from './DrumGrid.module.css'
import { DrumGrid } from './DrumGrid.tsx'
import './testDom.ts'

const under = (label: string) =>
  screen
    .getAllByRole('button', { name: new RegExp(`^${label} step \\d+$`) })
    .flatMap((cell, i) =>
      cell.className.split(' ').includes(styles.under!) ? [i + 1] : [],
    )

test('each row walks its own playhead off the kit’s step count', () => {
  engine.set(GRID_ROWS[0].len, 5)
  render(<DrumGrid />)
  expect(under('kick')).toEqual([])
  act(() => engine.setDrumsPlaying(true))
  act(() => engine.meter.set({ ...engine.meter.get(), tick: 7 }))
  expect(under('kick')).toEqual([3])
  expect(under('snare')).toEqual([8])
  act(() => engine.meter.set({ ...engine.meter.get(), tick: 0 }))
})

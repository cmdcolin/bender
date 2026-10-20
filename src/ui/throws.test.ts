import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { ROCK } from '../drums.ts'
import { render, rms } from '../dsp/testRender.ts'
import { THROWS } from './throws.ts'

// Brake once pushed a tape delay whose mix sat at zero, so it did nothing.
test('every throw changes the stock board with a beat on the kit', () => {
  const board = { ...DEFAULT_CONTROLS, ...ROCK }
  const base = render(board, 1.5)
  for (const t of THROWS) {
    const out = render({ ...board, ...t.push(board) }, 1.5)
    const diff = out.map((v, i) => v - base[i]!)
    expect(rms(diff) / rms(base), t.name).toBeGreaterThan(0.1)
  }
})

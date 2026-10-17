import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { render, rms } from '../dsp/testRender.ts'
import { THROWS } from './throws.ts'

// Brake once pushed a tape delay whose mix sat at zero, and a pad that does
// nothing on the stock board is the first one anybody presses.
test('every throw changes the stock board', () => {
  const base = render(DEFAULT_CONTROLS, 1.5)
  for (const t of THROWS) {
    const out = render(
      { ...DEFAULT_CONTROLS, ...t.push(DEFAULT_CONTROLS) },
      1.5,
    )
    const diff = out.map((v, i) => v - base[i]!)
    expect(rms(diff) / rms(base), t.name).toBeGreaterThan(0.1)
  }
})

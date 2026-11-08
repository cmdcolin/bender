import { expect, test } from 'vitest'

import { BridgedT } from './bridged.ts'

const SR = 48000

function ring(leak: number) {
  const tank = new BridgedT()
  tank.f = (2 * Math.PI * 60) / SR
  tank.rate = 1 / (0.3 * SR)
  tank.sweep = 4
  tank.drain = Math.exp(-1000 / (5 * SR))
  const out = new Float32Array(SR / 4)
  for (let i = 0; i < out.length; i++) {
    const struck = i < 24
    tank.pulse = struck
    tank.drive = (struck ? 0.05 : 0) + leak
    tank.run()
    out[i] = tank.out
  }
  return out
}

test('the swoop cap drains under a steady leak onto the trigger line', () => {
  const clean = ring(0)
  const leaking = ring(1e-7)
  let apart = 0
  let size = 0
  for (let i = 0; i < clean.length; i++) {
    apart = Math.max(apart, Math.abs(leaking[i]! - clean[i]!))
    size = Math.max(size, Math.abs(clean[i]!))
  }
  expect(apart / size).toBeLessThan(0.01)
})

import { expect, test } from 'vitest'

import { Adsr, adsrRates } from './adsr.ts'

const SR = 1000

const run = (
  env: Adsr,
  seconds: number,
  rates = adsrRates(SR, 1, 1, 0.5, 2),
) => {
  let v = 0
  for (let i = 0; i < seconds * SR; i++) v = env.step(rates)
  return v
}

test('an envelope climbs over its attack and decays to its sustain', () => {
  const env = new Adsr()
  env.trigger()
  expect(run(env, 0.5)).toBeCloseTo(0.5, 2)
  expect(run(env, 0.5)).toBeCloseTo(1, 2)
  expect(run(env, 1)).toBeCloseTo(0.505, 2)
  expect(run(env, 5)).toBeCloseTo(0.5, 3)
})

test('let go, it falls over its release and comes to rest', () => {
  const env = new Adsr()
  env.trigger()
  run(env, 3)
  env.release()
  expect(run(env, 2)).toBeCloseTo(0.005, 2)
  expect(run(env, 5)).toBe(0)
})

test('let go mid-attack, it falls from where it got to', () => {
  const env = new Adsr()
  env.trigger()
  run(env, 0.25)
  env.release()
  expect(run(env, 0.001)).toBeLessThan(0.25)
})

test('a retrigger climbs on from the level it stands at', () => {
  const env = new Adsr()
  env.trigger()
  run(env, 3)
  env.trigger()
  expect(env.step(adsrRates(SR, 1, 1, 0.5, 2))).toBeGreaterThan(0.5)
})

test('held on a sustain of nothing, the decay arrives at zero', () => {
  const env = new Adsr()
  env.trigger()
  expect(run(env, 300, adsrRates(SR, 0.01, 1, 0, 1))).toBe(0)
})

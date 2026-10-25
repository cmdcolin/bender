// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'

const load = async (kept: string) => {
  sessionStorage.setItem('bender.openStage', kept)
  vi.resetModules()
  const [{ forgetStaleStage, openStage }, { shownOn }, { GROUPS }, { engine }] =
    await Promise.all([
      import('./openStage.ts'),
      import('./fitted.ts'),
      import('./controls/index.ts'),
      import('../engine/engine.ts'),
    ])
  const shown = shownOn(engine.controls.get())
  return {
    forgetStaleStage,
    openStage,
    on: GROUPS.find(g => shown.has(g.name))!.name,
    off: GROUPS.find(g => !shown.has(g.name))!.name,
  }
}

test('a reload reopens the stage the tab had open', async () => {
  const first = await load('')
  const { forgetStaleStage, openStage } = await load(first.on)
  forgetStaleStage()
  expect(openStage.get()).toBe(first.on)
})

test('a kept stage the board no longer shows stays shut', async () => {
  const first = await load('')
  const { forgetStaleStage, openStage } = await load(first.off)
  forgetStaleStage()
  expect(openStage.get()).toBeNull()
})

test('closing the panel forgets the stage', async () => {
  const { openStage, on } = await load('')
  openStage.set(on)
  openStage.set(null)
  expect(sessionStorage.getItem('bender.openStage')).toBe('')
})

// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { App } from './App.tsx'
import { add } from './fitted.ts'
import { setStageDrawings } from './listView.ts'
import { openStage } from './openStage.ts'
import './testDom.ts'

test('a view picked on one stage stays on that stage', () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  setStageDrawings(true)
  act(() => add(['Plinky', 'Clatter']))
  act(() => openStage.set('Plinky'))
  const { unmount } = render(<App />)
  const plinky = screen.getByRole('group', { name: 'Plinky view' })
  fireEvent.click(within(plinky).getByRole('button', { name: 'all settings' }))
  act(() => openStage.set('Clatter'))
  const clatter = screen.getByRole('group', { name: 'Clatter view' })
  expect(
    within(clatter)
      .getByRole('button', { name: 'diagram' })
      .getAttribute('aria-pressed'),
  ).toBe('true')
  unmount()
})

test('a hit in a folded part opens the fold', async () => {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  act(() => openStage.set(null))
  act(() => add(['Board parts']))
  render(<App />)
  fireEvent.change(screen.getByRole('searchbox', { name: 'find a setting' }), {
    target: { value: 'mixer drive' },
  })
  fireEvent.click(screen.getAllByRole('button', { name: /Mixer drive/ })[0]!)
  await vi.waitFor(() =>
    expect(
      document.querySelector('aside [data-control="chipMixDrive"][data-aimed]'),
    ).not.toBeNull(),
  )
  const row = document.querySelector('aside [data-control="chipMixDrive"]')!
  expect(row.closest('details')?.open).toBe(true)
})

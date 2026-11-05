// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'

import { activity } from './activity.ts'
import { ActivityPanel } from './ActivityPanel.tsx'
import { createBenderApi } from './agentApi.ts'
import './testDom.ts'

const bender = createBenderApi()

const panel = () => screen.queryByRole('region', { name: 'script activity' })

beforeEach(() => activity.set({ headline: '', lines: [] }))

test('the panel stays away until a call changes the board', () => {
  render(<ActivityPanel />)
  act(() => {
    bender.summary()
    bender.board()
    bender.find('delay')
  })
  expect(panel()).toBeNull()
  act(() => {
    bender.set('chipStarve', 0.5)
  })
  expect(panel()?.textContent).toContain('set chipStarve 0.50')
})

test('the panel heads the calls with what the script says, newest first', () => {
  render(<ActivityPanel />)
  act(() => {
    bender.say('breath in the lead')
    bender.set('chipStarve', 0.5)
  })
  expect(screen.getByRole('list').textContent).toMatch(
    /set chipStarve 0\.50.*breath in the lead/,
  )
  expect(panel()?.firstElementChild?.textContent).toContain(
    'breath in the lead',
  )
})

test('folding keeps the headline, and closing hides the panel', () => {
  render(<ActivityPanel />)
  act(() => {
    bender.say('the kick drops')
  })
  fireEvent.click(screen.getByRole('button', { name: 'fold the calls' }))
  expect(screen.queryByRole('list')).toBeNull()
  expect(panel()?.textContent).toContain('the kick drops')
  fireEvent.click(screen.getByRole('button', { name: 'show the calls' }))
  expect(screen.getByRole('list')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'close the activity' }))
  act(() => {
    bender.set('chipStarve', 0.6)
  })
  expect(panel()).toBeNull()
})

test('a set floats the bent control off the panel and draws it a lane', () => {
  render(<ActivityPanel />)
  act(() => {
    bender.set('chipStarve', 0.5)
  })
  expect(panel()?.querySelector('[role="img"]')).not.toBeNull()
  expect(document.body.textContent).toMatch(/Starve.*0\.50/)
})

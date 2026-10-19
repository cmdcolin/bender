// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { siteRoot } from '../site/paths.ts'
import { App } from './App.tsx'
import './testDom.ts'

// The nameplate is the only way to the home page and the build number, and
// neither is reachable from a panel made of stages otherwise.

const nameplate = () => screen.getByRole('button', { name: /^bender/ })

test('the nameplate opens the card, and it links home', () => {
  render(<App />)
  expect(screen.queryByRole('dialog', { name: 'about bender' })).toBe(null)

  fireEvent.click(nameplate())
  const card = screen.getByRole('dialog', { name: 'about bender' })
  const home = screen.getByRole('link', { name: /bender home/ })
  expect(home.getAttribute('href')).toBe(siteRoot)

  fireEvent.click(screen.getByRole('button', { name: 'close' }))
  expect(card.isConnected).toBe(false)
})

// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { App } from './App'
import './testDom'

// The nameplate is the only way to the source, the docs and the build number,
// and none of the three is reachable from a panel made of stages otherwise.

const nameplate = () => screen.getByRole('button', { name: /^bender/ })

test('the nameplate opens the card, and it carries the source', () => {
  render(<App />)
  expect(screen.queryByRole('dialog', { name: 'about bender' })).toBe(null)

  fireEvent.click(nameplate())
  const card = screen.getByRole('dialog', { name: 'about bender' })
  const source = screen.getByRole('link', { name: /source on GitHub/ })
  expect(source.getAttribute('href')).toBe('https://github.com/cmdcolin/bender')

  fireEvent.click(screen.getByRole('button', { name: 'close' }))
  expect(card.isConnected).toBe(false)
})

// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { useBoardUrl } from './useBoardUrl'
import './testDom'

// The address bar as the board. A hash arriving is a whole board arriving, and
// the only interesting half of that is what it says about the controls it does
// not name.

function Bar() {
  useBoardUrl()
  return null
}

const arrive = (hash: string) => {
  window.location.hash = hash
  act(() => {
    fireEvent(window, new Event('hashchange'))
  })
}

test('a link arriving replaces the board rather than editing it', () => {
  render(<Bar />)
  act(() => engine.set('dlyFb', 1.4))

  arrive('#set=combFb:0.9')
  expect(engine.controls.get().combFb).toBe(0.9)
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
})

// A stock board writes no param at all, so stepping back off a link lands on a
// bare url — and that url opened fresh is the stock board. Read as "no board
// here, leave the panel alone", one address meant two boards.
test('a bare url is the stock board, not nothing to do', () => {
  render(<Bar />)
  act(() => engine.patch({ dlyFb: 1.4, filtRes: 1.2, bodyX: 0.7 }))

  arrive('')
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
  expect(engine.controls.get().filtRes).toBe(DEFAULT_CONTROLS.filtRes)
  // Your finger is the exception: the link never carried it either way.
  expect(engine.controls.get().bodyX).toBe(0.7)
})

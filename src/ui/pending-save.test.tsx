// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { App } from './App'
import { boardHash } from './share'
import './testDom'

import type { SavedVoice } from './voiceModel'

// The save somebody presses before they have an account. It is held, the app
// asks why-an-account, and the sign-in that answers writes the board that was
// on screen when the key went down — rather than making them find the save
// button a second time.
//
// The whole cloud is a stand-in here: what is under test is the handover
// between a press and a sign-in, and Firestore has nothing to say about it.

const cloud = vi.hoisted(() => {
  const user = { uid: 'u1', name: 'Tester', photo: null }
  const state = {
    user,
    signedIn: false,
    voices: [] as SavedVoice[],
    writes: [] as SavedVoice[][],
    listener: null as ((u: typeof user | null) => void) | null,
  }
  return state
})

vi.mock('./cloud', () => ({
  wasSignedIn: () => false,
  // Firebase's own subscription fires immediately with whoever is restored, so
  // this one does too — which is what makes the order of the popup and the
  // subscription beside the point.
  watchAuth: (onUser: (u: unknown) => void) => {
    cloud.listener = onUser
    onUser(cloud.signedIn ? cloud.user : null)
    return Promise.resolve(() => {
      cloud.listener = null
    })
  },
  // The popup resolves before the panel has subscribed, which is the order a
  // browser's first sign-in actually takes: the subscription goes on when the
  // press flips the hook into wanting one.
  signIn: () => {
    cloud.signedIn = true
    cloud.listener?.(cloud.user)
    return Promise.resolve(cloud.user)
  },
  signOut: () => Promise.resolve(),
  fetchHome: () => Promise.resolve({ voices: cloud.voices, current: null }),
  editVoices: async (
    _uid: string,
    edit: (voices: SavedVoice[]) => SavedVoice[],
  ) => {
    await Promise.resolve()
    const next = edit([...cloud.voices])
    cloud.voices = next
    cloud.writes.push([...next])
    return next
  },
  putCurrent: () => Promise.resolve(),
}))

beforeEach(() => {
  cloud.signedIn = false
  cloud.voices = []
  cloud.writes = []
  cloud.listener = null
})

const saveBtn = () => screen.getByRole('button', { name: /^save/ })

/** The name the dialog says the waiting save will land under. */
const pendingName = () =>
  screen.getByRole('dialog', { name: 'why sign in' }).querySelector('b')
    ?.textContent ?? ''

test('a save pressed signed out lands on the sign-in that answers it', async () => {
  render(<App />)
  // A board worth keeping: the stock one spells out as the empty hash, which
  // would let a save that wrote nothing at all pass this.
  act(() => {
    engine.writeBoard({ ...DEFAULT_CONTROLS, chipStarve: 0.8 })
  })
  const board = boardHash('', engine.controls.get())
  expect(board).not.toBe('')

  fireEvent.click(saveBtn())
  const name = pendingName()
  expect(name).not.toBe('')

  fireEvent.click(screen.getByRole('button', { name: 'sign in with Google' }))

  await waitFor(() => {
    expect(cloud.writes.length).toBe(1)
  })
  const saved = cloud.writes[0]!
  expect(saved.map(v => v.name)).toEqual([name])
  // The board as it stood when the key went down, spelled the way a link
  // spells it.
  expect(saved[0]!.query).toBe(board)
  // And the question is gone, because it has been answered.
  expect(screen.queryByRole('dialog', { name: 'why sign in' })).toBe(null)
})

test('the held save never overwrites a voice the account already had', async () => {
  render(<App />)
  fireEvent.click(saveBtn())
  const name = pendingName()
  // The name was worked out against an empty list, because signed out there is
  // no list. The account turns out to have that name already.
  cloud.voices = [{ name, query: 'chipStarve=1' }]

  fireEvent.click(screen.getByRole('button', { name: 'sign in with Google' }))

  await waitFor(() => {
    expect(cloud.writes.length).toBe(1)
  })
  const saved = cloud.writes[0]!
  expect(saved.map(v => v.name)).toEqual([name, `${name} 2`])
  expect(saved[0]!.query).toBe('chipStarve=1')
})

test('a sign-in nobody was mid-save for writes nothing', async () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'sign in' }))
  fireEvent.click(screen.getByRole('button', { name: 'sign in with Google' }))

  // The library button, which says `saved` once there is an account behind it.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'saved' })).toBeTruthy()
  })
  expect(cloud.writes).toEqual([])
})

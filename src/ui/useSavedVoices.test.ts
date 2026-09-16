// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { useSavedVoices } from './useSavedVoices'

import type { SavedVoice } from './voiceModel'

const store = vi.hoisted(() => ({ voices: [] as { name: string }[] }))

vi.mock('./cloud', () => {
  const user = { uid: 'u1', name: 'Tester', photo: null }
  let listener: ((u: typeof user | null) => void) | null = null
  let signedIn = false
  return {
    wasSignedIn: () => false,
    watchAuth: (onUser: (u: typeof user | null) => void) => {
      listener = onUser
      onUser(signedIn ? user : null)
      return Promise.resolve(() => {})
    },
    signIn: () => {
      signedIn = true
      listener?.(user)
      return Promise.resolve(user)
    },
    signOut: () => Promise.resolve(),
    fetchHome: () => Promise.resolve({ voices: [], current: null }),
    editVoices: async (
      _uid: string,
      edit: (voices: SavedVoice[]) => SavedVoice[],
    ) => {
      await new Promise(r => setTimeout(r, 5))
      store.voices = edit(store.voices as SavedVoice[])
      return store.voices
    },
  }
})

test('two saves in quick succession both land', async () => {
  const { result } = renderHook(() => useSavedVoices())
  act(() => {
    result.current.signIn()
  })
  await waitFor(() => {
    expect(result.current.status).toBe('ready')
  })

  act(() => {
    result.current.saveVoice('first', 'p=AAAA')
    result.current.saveVoice('second', 'p=BBBB')
  })

  await waitFor(() => {
    expect(result.current.voices.map(v => v.name).toSorted()).toEqual([
      'first',
      'second',
    ])
  })
  expect(store.voices.map(v => v.name).toSorted()).toEqual(['first', 'second'])
})

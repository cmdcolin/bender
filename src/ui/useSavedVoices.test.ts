// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { useSavedVoices } from './useSavedVoices'
import { QUERY_MAX } from './voiceModel'

import type { SavedVoice } from './voiceModel'

const cloud = vi.hoisted(() => {
  const user = { uid: 'u1', name: 'Tester', photo: null }
  return {
    user,
    signedIn: false,
    listener: null as ((u: typeof user | null) => void) | null,
    stored: [] as SavedVoice[],
    fetches: [] as (() => void)[],
    holdFetch: false,
    failFetch: false,
    failSdk: false,
    holdPopup: false,
    popups: [] as { land: () => void; fail: (e: unknown) => void }[],
    failWrite: null as { code: string } | null,
  }
})

vi.mock('./cloud', () => ({
  wasSignedIn: () => false,
  watchAuth: (onUser: (u: typeof cloud.user | null) => void) => {
    if (cloud.failSdk) return Promise.reject(new Error('offline'))
    cloud.listener = onUser
    onUser(cloud.signedIn ? cloud.user : null)
    return Promise.resolve(() => {})
  },
  // Firebase notifies auth listeners only when the uid changes.
  signIn: () => {
    if (cloud.failSdk) return Promise.reject(new Error('offline'))
    const land = () => {
      const was = cloud.signedIn
      cloud.signedIn = true
      if (!was) cloud.listener?.(cloud.user)
    }
    if (!cloud.holdPopup) {
      land()
      return Promise.resolve(cloud.user)
    }
    return new Promise((resolve, reject) => {
      cloud.popups.push({
        land: () => {
          land()
          resolve(cloud.user)
        },
        fail: reject,
      })
    })
  },
  signOut: () => {
    cloud.signedIn = false
    cloud.listener?.(null)
    return Promise.resolve()
  },
  fetchHome: () =>
    new Promise((resolve, reject) => {
      if (cloud.failFetch) {
        reject(new Error('offline'))
        return
      }
      const answer = () => resolve({ voices: cloud.stored, current: null })
      if (cloud.holdFetch) cloud.fetches.push(answer)
      else answer()
    }),
  editVoices: async (
    _uid: string,
    edit: (voices: SavedVoice[]) => SavedVoice[],
  ) => {
    await new Promise(r => setTimeout(r, 5))
    if (cloud.failWrite !== null) throw cloud.failWrite
    cloud.stored = edit(cloud.stored)
    return cloud.stored
  },
}))

beforeEach(() => {
  cloud.signedIn = false
  cloud.listener = null
  cloud.stored = []
  cloud.fetches = []
  cloud.holdFetch = false
  cloud.failFetch = false
  cloud.failSdk = false
  cloud.holdPopup = false
  cloud.popups = []
  cloud.failWrite = null
})

const names = (voices: readonly SavedVoice[]) =>
  voices.map(v => v.name).toSorted()

async function signedIn() {
  const hook = renderHook(() => useSavedVoices())
  act(() => {
    hook.result.current.signIn()
  })
  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready')
  })
  return hook
}

test('two saves in quick succession both land', async () => {
  const { result } = await signedIn()
  act(() => {
    result.current.saveVoice('first', 'p=AAAA')
    result.current.saveVoice('second', 'p=BBBB')
  })
  await waitFor(() => {
    expect(names(result.current.voices)).toEqual(['first', 'second'])
  })
  expect(names(cloud.stored)).toEqual(['first', 'second'])
})

test('a board over the length limit is refused with its length', async () => {
  const { result } = await signedIn()
  let outcome = ''
  act(() => {
    outcome = result.current.saveVoice('huge', `p=${'A'.repeat(QUERY_MAX)}`)
  })
  expect(outcome).toBe('too-long')
  expect(result.current.error).toContain(String(QUERY_MAX + 2))
  await new Promise(r => setTimeout(r, 20))
  expect(cloud.stored).toEqual([])
})

test('a refused write says why', async () => {
  const { result } = await signedIn()
  cloud.failWrite = { code: 'permission-denied' }
  act(() => {
    result.current.saveVoice('first', 'p=AAAA')
  })
  await waitFor(() => {
    expect(result.current.error).toBe(
      'could not save — sign-in expired, sign out and back in',
    )
  })
})

test('a save while the list loads lands once it arrives', async () => {
  cloud.holdFetch = true
  cloud.stored = [{ name: 'old', query: 'p=OLD' }]
  const { result } = renderHook(() => useSavedVoices())
  act(() => {
    result.current.signIn()
  })
  await waitFor(() => {
    expect(result.current.user).not.toBe(null)
  })
  let outcome = ''
  act(() => {
    outcome = result.current.saveVoice('new', 'p=NEW')
  })
  expect(outcome).toBe('saving')
  act(() => {
    for (const answer of cloud.fetches) answer()
  })
  await waitFor(() => {
    expect(names(result.current.voices)).toEqual(['new', 'old'])
  })
})

test('a list that arrives after sign-out stays off screen', async () => {
  cloud.holdFetch = true
  cloud.stored = [{ name: 'old', query: 'p=OLD' }]
  const { result } = renderHook(() => useSavedVoices())
  act(() => {
    result.current.signIn()
  })
  await waitFor(() => {
    expect(cloud.fetches.length).toBe(1)
  })
  act(() => {
    result.current.signOut()
  })
  await act(async () => {
    cloud.fetches[0]!()
    await Promise.resolve()
  })
  expect(result.current.status).toBe('signed-out')
  expect(result.current.voices).toEqual([])
})

test('a sign-in after the SDK failed to load subscribes again', async () => {
  cloud.failSdk = true
  const { result } = renderHook(() => useSavedVoices())
  act(() => {
    result.current.signIn()
  })
  await waitFor(() => {
    expect(result.current.status).toBe('error')
  })
  cloud.failSdk = false
  act(() => {
    result.current.signIn()
  })
  await waitFor(() => {
    expect(result.current.status).toBe('ready')
  })
})

test('signing in again after the list failed to load fetches it again', async () => {
  cloud.failFetch = true
  const { result } = renderHook(() => useSavedVoices())
  act(() => {
    result.current.signIn()
  })
  await waitFor(() => {
    expect(result.current.status).toBe('error')
  })
  expect(result.current.user).not.toBe(null)
  cloud.failFetch = false
  act(() => {
    result.current.signIn()
  })
  await waitFor(() => {
    expect(result.current.status).toBe('ready')
  })
})

test('a popup superseded by a second sign-in keeps the held save', async () => {
  cloud.holdPopup = true
  const { result } = renderHook(() => useSavedVoices())
  act(() => {
    expect(result.current.saveVoice('held', 'p=HELD')).toBe('needs-auth')
    result.current.signIn()
  })
  act(() => {
    result.current.signIn()
  })
  await act(async () => {
    cloud.popups[0]!.fail({ code: 'auth/cancelled-popup-request' })
    await Promise.resolve()
  })
  expect(result.current.status).toBe('loading')
  act(() => {
    cloud.popups[1]!.land()
  })
  await waitFor(() => {
    expect(names(result.current.voices)).toEqual(['held'])
  })
})

test('a recall during a save leaves the recalled name as the last one', async () => {
  const { result } = await signedIn()
  act(() => {
    result.current.saveVoice('saved', 'p=AAAA')
    result.current.markRecalled('recalled')
  })
  await waitFor(() => {
    expect(result.current.flash).toEqual({ kind: 'saved', name: 'saved' })
  })
  expect(result.current.lastName).toBe('recalled')
})

test('a held save dropped before sign-in writes nothing', async () => {
  const { result } = renderHook(() => useSavedVoices())
  act(() => {
    result.current.saveVoice('held', 'p=HELD')
    result.current.dropPending()
  })
  act(() => {
    result.current.signIn()
  })
  await waitFor(() => {
    expect(result.current.status).toBe('ready')
  })
  await new Promise(r => setTimeout(r, 20))
  expect(cloud.stored).toEqual([])
})

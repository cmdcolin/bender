// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'

import '../ui/testDom'

const user = { uid: 'u1', name: 'Tester', photo: null }

vi.mock('../ui/cloud', () => ({
  wasSignedIn: () => true,
  watchAuth: () => Promise.reject(new Error('offline')),
  warmSignIn: () => {},
  signIn: () => Promise.resolve(user),
  signOut: () => Promise.resolve(),
  fetchHome: () => Promise.resolve({ voices: [], current: null }),
}))

const flush = () => new Promise(r => setTimeout(r, 0))

test('a sign-in after the subscription failed to load paints the home', async () => {
  document.body.innerHTML = `
    <div id="landing"><section id="demos"><ul class="grid"></ul></section></div>
    <div id="home" hidden></div>
    <button id="signIn"></button>
    <div id="acct" hidden>
      <button id="acctBtn"></button>
      <div id="acctMenu" hidden><span id="acctName"></span><button id="signOut"></button></div>
      <span id="avatar"></span>
    </div>
    <button id="why"></button><button id="whyBelow"></button>
    <dialog id="whyCard">
      <button id="whyClose"></button><button id="whySignIn"></button>
      <p id="whyTrouble" hidden></p>
    </dialog>`
  await import('./main')
  await flush()

  document.getElementById('signIn')!.click()
  await flush()

  expect(document.getElementById('home')!.hidden).toBe(false)
  expect(document.getElementById('landing')!.hidden).toBe(true)
})

test('the demos grid opens with the board of the day', async () => {
  await vi.waitFor(() => {
    expect(document.querySelector('#demos .grid > li.today')).not.toBe(null)
  })
  const link = document.querySelector<HTMLAnchorElement>('.today a')!
  expect(link.href).toContain('#p=')
  expect(link.textContent).toContain('Board of the day')
})

// @vitest-environment node
import { experimental_AstroContainer } from 'astro/container'
import { beforeAll, expect, test } from 'vitest'

import Landing from '../pages/index.astro'
import Privacy from '../pages/privacy.astro'
import { FREE_WITHOUT, PITCH } from '../ui/whySignIn'
import { showcase, slug } from './demos'
import { privacyUrl } from './paths'

// The landing page answers "why sign in?" out of the same strings the app's own
// card renders, and it answers in the HTML rather than from script: a reader
// with JavaScript off still gets it, and the two cards cannot drift apart.

const privacyHref = `href="${privacyUrl}"`

// CROSS_REPO_SYNC(landing-page-test)
let landing = ''
let privacy = ''

beforeAll(async () => {
  const container = await experimental_AstroContainer.create()
  landing = await container.renderToString(Landing)
  privacy = await container.renderToString(Privacy)
})

test('the card carries the answer, in the page', () => {
  expect(landing).toContain(PITCH)
  expect(landing).toContain(FREE_WITHOUT)
})

test('the question is asked where the ask is, and the card can be opened', () => {
  expect(landing.match(/Why sign in\?/g)?.length).toBe(2)
  expect(landing).toContain('id="whyCard"')
  expect(landing).toContain('id="whySignIn"')
})

test('the card sends anyone who wants the rest to the privacy page', () => {
  expect(landing).toContain(privacyHref)
  expect(privacy).toContain('Google Analytics')
  expect(privacy).toContain('Firebase')
})

test('the privacy page leaves out the account controls it cannot work', () => {
  // The bar's sign-in half needs src/home/main.ts, which this page does not
  // load, and a button that answers nothing is worse than no button.
  expect(privacy).not.toContain('id="signIn"')
  expect(privacy).toContain('Open the app')
})

test('no page loads Google Analytics before the visitor says yes', () => {
  for (const page of [landing, privacy])
    expect(page).not.toContain('googletagmanager.com')
})
// CROSS_REPO_SYNC_END(landing-page-test)

test('the landing page shows the demos from demos.json and no presets', () => {
  for (const demo of showcase) expect(landing).toContain(demo.name)
  expect(landing.match(/class="track"/g)?.length).toBe(showcase.length)
})

test('the showcase links each of its clips and nothing else', () => {
  expect(showcase.length).toBeGreaterThan(0)
  expect(landing.match(/class="play"/g)?.length).toBe(showcase.length)
  for (const demo of showcase)
    expect(landing).toContain(`demos/${slug(demo.name)}.mp3`)
})

test('the demos come after the panel figure, at the foot of the page', () => {
  expect(landing.indexOf('id="demos"')).toBeGreaterThan(
    landing.indexOf('panel-callout.jpg'),
  )
})

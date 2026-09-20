// @vitest-environment node
import { experimental_AstroContainer } from 'astro/container'
import { beforeAll, expect, test } from 'vitest'

import Landing from '../pages/index.astro'
import Privacy from '../pages/privacy.astro'
import { privacyUrl } from '../site/paths'
import { FREE_WITHOUT, PITCH } from '../ui/whySignIn'
import { showcase, slug } from './demos'

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

// A shared link is how most people meet this page, so the tags it unfurls with
// are worth a test. They carry absolute URLs: a card is rendered by somebody
// else's server, where a path relative to this site means nothing.
test('the landing page unfurls with a title, a blurb and a picture', () => {
  for (const tag of [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="bender">',
    '<meta name="twitter:card" content="summary_large_image">',
  ])
    expect(landing).toContain(tag)

  for (const property of ['og:url', 'og:image', 'twitter:image'])
    expect(landing).toMatch(
      new RegExp(`(property|name)="${property}" content="https://`),
    )
})

test('every page names itself canonically, and only once', () => {
  for (const page of [landing, privacy]) {
    expect(page.match(/rel="canonical"/g)?.length).toBe(1)
    expect(page).toMatch(/<link rel="canonical" href="https:\/\/[^"]+\/">/)
  }
})

// The browser reserves space for the figure from these before it has the file,
// so a ratio that disagrees with the image moves the page as it loads.
test('the panel figure declares the shape the file actually is', () => {
  const figure = /panel-callout\.jpg" width="(\d+)" height="(\d+)"/.exec(
    landing,
  )
  expect(figure).not.toBeNull()
  expect([figure![1], figure![2]]).toEqual(['1911', '1294'])
})

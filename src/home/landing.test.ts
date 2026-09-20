// @vitest-environment node
import { experimental_AstroContainer } from 'astro/container'
import { beforeAll, expect, test } from 'vitest'

import Landing from '../pages/index.astro'
import Privacy from '../pages/privacy.astro'
import { privacyUrl } from '../site/paths'
import { PANEL_SHOT } from '../site/site'
import { FREE_WITHOUT, PITCH } from '../ui/whySignIn'
import { showcase, slug } from './demos'

import { readFileSync } from 'node:fs'

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

// Not the guide: it reads the user guide out of a content collection, which the
// container has no loader for.
test('the pages it can render name themselves canonically, once each', () => {
  for (const page of [landing, privacy]) {
    expect(page.match(/rel="canonical"/g)?.length).toBe(1)
    expect(page).toMatch(/<link rel="canonical" href="https:\/\/[^"]+\/">/)
  }
})

// The browser reserves space for the figure from these before it has the file,
// so a ratio that disagrees with the image moves the page as it loads. Read out
// of the JPEG rather than compared against the same constant that wrote them,
// which would only have agreed with itself.
test('the panel figure declares the shape the file actually is', () => {
  const jpeg = readFileSync(`public/${PANEL_SHOT.file}`)
  let at = 2
  let shape: { width: number; height: number } | undefined
  while (at < jpeg.length && shape === undefined) {
    if (jpeg[at] !== 0xff) {
      at++
      continue
    }
    const marker = jpeg[at + 1]!
    // A start-of-frame carries the size; the other 0xFFCn markers do not.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    )
      shape = {
        height: jpeg.readUInt16BE(at + 5),
        width: jpeg.readUInt16BE(at + 7),
      }
    else at += 2 + jpeg.readUInt16BE(at + 2)
  }

  expect(shape).toEqual({ width: PANEL_SHOT.width, height: PANEL_SHOT.height })
  expect(landing).toContain(
    `${PANEL_SHOT.file}" width="${PANEL_SHOT.width}" height="${PANEL_SHOT.height}"`,
  )
})

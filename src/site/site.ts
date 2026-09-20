import { appUrl, guideUrl, privacyUrl, siteRoot } from './paths'

// Where the site is served from, for the canonical link every page carries and
// for the absolute URLs a shared link unfurls with. The host is GitHub Pages
// and the path is the repo, which is `base` in astro.config.ts — so the path
// half comes from `siteRoot` rather than being written out a second time.
export const ORIGIN = `https://cmdcolin.github.io${siteRoot}`

// The panel picture: the landing page leads with it and a shared link unfurls
// with it. The browser reserves space for the figure from these numbers before
// it has the file, so they have to be the shape the file actually is —
// landing.test.ts reads the JPEG and checks.
export const PANEL_SHOT = {
  file: 'panel-callout.jpg',
  width: 1911,
  height: 1294,
} as const

// What the shared site components say about this product: its name, where its
// pages are, and the links the bar and the footer carry.
const REPO = 'https://github.com/cmdcolin/bender'

export const SITE = {
  name: 'bender',
  home: siteRoot,
  icon: `${siteRoot}favicon.svg`,
  app: appUrl,
  nav: [
    [guideUrl, 'User guide'],
    [REPO, 'GitHub'],
    [privacyUrl, 'Privacy'],
  ],
  footer: [
    [appUrl, 'Open the app ↗'],
    [guideUrl, 'User guide'],
    [REPO, 'GitHub ↗'],
    [privacyUrl, 'Privacy'],
    ['https://videoskillet.com/', "bender's sibling: videoskillet ↗"],
  ],
} as const

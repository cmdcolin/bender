import { appUrl, guideUrl, privacyUrl, siteRoot } from './paths'

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
    [REPO, 'Source'],
    [privacyUrl, 'Privacy'],
  ],
  footer: [
    [appUrl, 'Open the app ↗'],
    [guideUrl, 'User guide'],
    [REPO, 'GitHub ↗'],
    [privacyUrl, 'Privacy'],
  ],
} as const

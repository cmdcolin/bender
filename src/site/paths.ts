// Where each page lives. GitHub Pages serves the repo under a base path, so
// every URL on the site is built from `siteRoot` rather than written out.
export const siteRoot = import.meta.env.BASE_URL.replace(/\/?$/, '/')

export const appUrl = `${siteRoot}app/`

export const privacyUrl = `${siteRoot}privacy/`

export const guideUrl = `${siteRoot}guide/`

export const boardUrl = (query: string) => `${appUrl}#${query}`

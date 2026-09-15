export const siteRoot = import.meta.env.BASE_URL.replace(/\/?$/, '/')

export const appUrl = `${siteRoot}app/`

export const boardUrl = (query: string) => `${appUrl}#${query}`

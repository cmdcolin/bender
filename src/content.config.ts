import { defineCollection } from 'astro:content'

import { readFileSync } from 'node:fs'

const REPO = 'https://github.com/cmdcolin/bender'

// The user guide lives in docs/, read by people on GitHub too, so the guide
// page renders it straight from there rather than keeping a second copy. Its
// links to sibling docs (BENDS.md, MIDI.md, ...) stay relative for GitHub;
// this loader rewrites them to full GitHub URLs since this site only builds
// a page for the guide itself.
const docs = defineCollection({
  loader: {
    name: 'user-guide',
    load: async ({ store, renderMarkdown }) => {
      const raw = readFileSync(
        new URL('../docs/USER-GUIDE.md', import.meta.url),
        'utf-8',
      )
      const body = raw.replace(
        /\]\(([\w-]+\.md)(#[^)]*)?\)/g,
        (_match, file, hash = '') => `](${REPO}/blob/main/docs/${file}${hash})`,
      )
      const rendered = await renderMarkdown(body)
      store.set({ id: 'user-guide', body, data: {}, rendered })
    },
  },
})

export const collections = { docs }

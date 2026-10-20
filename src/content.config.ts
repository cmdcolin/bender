import { glob } from 'astro/loaders'
import { defineCollection } from 'astro:content'

import { postSchema } from './site/posts.ts'

import { readFileSync } from 'node:fs'

// The user guide lives in docs/ so GitHub renders it too. The guide page renders
// it from there; its screenshots sit in public/guide/ and the loader points
// them at the site's own copy.
const docs = defineCollection({
  loader: {
    name: 'user-guide',
    load: async context => {
      const raw = readFileSync(
        new URL('../docs/USER-GUIDE.md', import.meta.url),
        'utf-8',
      )
      const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
      const body = raw.replace(
        /\]\(\.\.\/public\/guide\/([\w.-]+)\)/g,
        (_match, file) => `](${base}guide/${file})`,
      )
      const rendered = await context.renderMarkdown(body)
      context.store.set({ id: 'user-guide', body, data: {}, rendered })
    },
  },
})

const posts = defineCollection({
  loader: glob({ base: 'src/posts', pattern: '*.md' }),
  schema: postSchema,
})

export const collections = { docs, posts }

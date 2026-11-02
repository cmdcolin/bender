import { glob } from 'astro/loaders'
import { defineCollection } from 'astro:content'
import { postSchema } from 'skillet-shared/posts'

import { readFileSync } from 'node:fs'

// The user guide lives in docs/ so GitHub renders it too. The guide page renders
// it from there; its screenshots sit in public/guide/, shot at twice the app's
// size, and the loader points them at the site's own copy at half their pixels.
function jpegSize(jpeg: Buffer, at = 2): { width: number; height: number } {
  const marker = jpeg[at + 1] ?? 0
  const isFrame =
    marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
  return isFrame
    ? { height: jpeg.readUInt16BE(at + 5), width: jpeg.readUInt16BE(at + 7) }
    : jpegSize(jpeg, at + 2 + jpeg.readUInt16BE(at + 2))
}

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
        /!\[([^\]]*)\]\(\.\.\/public\/guide\/([\w.-]+)\)/g,
        (_match, alt: string, file: string) => {
          const { width, height } = jpegSize(
            readFileSync(new URL(`../public/guide/${file}`, import.meta.url)),
          )
          return `<img src="${base}guide/${file}" width="${Math.round(width / 2)}" height="${Math.round(height / 2)}" alt="${alt.replaceAll('"', '&quot;')}">`
        },
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

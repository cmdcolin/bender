import { expect, test } from 'vitest'

// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Astro emits a layout's stylesheets *after* the importing page's, so a page
// that imports its own sheet gets it first in the cascade — in front of the
// shared rules it is usually trying to override. That cost the landing page and
// the guide all their vertical padding once: `.wrap` in site.css sets `padding`,
// the shorthand, and it beat `.landing`'s and `.doc`'s `padding-block` purely by
// arriving later.
//
// So Page.astro imports every sheet the site has, in cascade order, and no page
// imports one at all. These two tests are that rule.

const layout = readFileSync('src/layouts/Page.astro', 'utf8')

const pages = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? pages(join(dir, entry.name))
      : entry.name.endsWith('.astro')
        ? [join(dir, entry.name)]
        : [],
  )

test('the layout imports every stylesheet, shared ones first', () => {
  const imported = [...layout.matchAll(/^import '([^']+\.css)'$/gm)].map(
    m => m[1],
  )
  expect(imported).toEqual([
    '../theme.css',
    '../site/site.css',
    '../site/footer.css',
    '../site/home.css',
    '../site/guide.css',
  ])
})

test('no page imports a stylesheet of its own', () => {
  for (const page of pages('src/pages')) {
    const source = readFileSync(page, 'utf8')
    expect({ page, css: /^import '[^']+\.css'$/m.test(source) }).toEqual({
      page,
      css: false,
    })
  }
})

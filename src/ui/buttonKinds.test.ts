// @vitest-environment node

import { expect, test } from 'vitest'

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// A module that composes a kind from button.module.css and then sets one of
// the kind's own properties loses: the bundle emits button.module.css after
// the module, so the kind's value wins and the override never shows. A look
// that differs from a kind belongs in button.module.css as a variant.

const DIR = 'src/ui'
const KINDS = 'button.module.css'
const LOOK =
  /^\s*(color|background(-color)?|border(-[\w-]+)?|padding(-[\w-]+)?|font-size|font-weight|line-height|opacity|min-height|height)\s*:/

const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const rules = (css: string) =>
  [...uncomment(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
    selector: m[1]!.trim().split('\n').pop()!.trim(),
    body: m[2]!,
  }))

function overrides(css: string): string[] {
  const all = rules(css)
  const composes = new Map<string, string[]>()
  for (const { selector, body } of all) {
    const own = /^\.([\w-]+)$/.exec(selector)?.[1]
    if (own === undefined) continue
    for (const m of body.matchAll(/composes:\s*([^;]+);/g))
      composes.set(own, [...(composes.get(own) ?? []), m[1]!])
  }
  const reachesKind = (cls: string, seen: Set<string>): boolean =>
    (composes.get(cls) ?? []).some(
      c =>
        c.includes(KINDS) ||
        c
          .split(/\s+/)
          .some(
            local =>
              !seen.has(local) && reachesKind(local, new Set([...seen, cls])),
          ),
    )
  return all
    .filter(({ selector, body }) => {
      const cls = /^\.([\w-]+)$/.exec(selector)?.[1]
      return (
        cls !== undefined &&
        reachesKind(cls, new Set()) &&
        body.split(';').some(declaration => LOOK.test(declaration))
      )
    })
    .map(({ selector }) => selector)
}

test('the check finds an override through a local composes', () => {
  expect(
    overrides(`
      .a { composes: action from './button.module.css'; }
      .b { composes: a; color: red; }
      .c { composes: chip from './button.module.css'; margin-left: auto; }
    `),
  ).toEqual(['.b'])
})

test('no module overrides a button kind it composes', () => {
  const found = readdirSync(DIR)
    .filter(f => f.endsWith('.module.css') && f !== KINDS)
    .flatMap(f =>
      overrides(readFileSync(join(DIR, f), 'utf8')).map(s => `${f} ${s}`),
    )
  expect(found).toEqual([])
})

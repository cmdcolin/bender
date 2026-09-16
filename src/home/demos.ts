// `demos.json` lists the demos. Every one gets a card on the landing page and a
// line in the README; the ones marked `showcase` also get a clip under the
// hero, which `scripts/demoreel.ts` renders offline at build time.
import listed from '../../demos.json'

export interface Demo {
  name: string
  says: string
  query: string
  showcase: boolean
}

export const slug = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')

export const demos: Demo[] = listed

export const showcase = demos.filter(demo => demo.showcase)

export const clipPath = (demo: Demo) => `demos/${slug(demo.name)}.mp3`

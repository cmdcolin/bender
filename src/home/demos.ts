// `demos.json` lists the demos. Every one gets a line in the README; the ones
// marked `showcase` also get a row in the landing page's Demos section, playing
// a clip `scripts/demoreel.ts` renders offline at build time.
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

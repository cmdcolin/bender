import { writeFileSync } from 'node:fs'
import { DEFAULT_CONTROLS, type Controls } from '../src/controls'
import { buildMap, drawMap, type Palette } from '../src/ui/chain-map'
import { serialize } from '../src/ui/svg'

// The README's signal path, drawn by the same code the panel draws with, in a
// pair of themes so it reads on GitHub light and dark. `pnpm diagram` rewrites
// it; chain-map.test.ts fails if the committed copies fall behind.

// Everything patched in, so no stage greys out as "not in the path".
const BOARD: Controls = {
  ...DEFAULT_CONTROLS,
  drumLevel: 0.6,
  oscLevel: 0.5,
  noiseLevel: 0.2,
  micLevel: 0.5,
  ringMix: 0.5,
  crushMix: 0.5,
  distMix: 0.5,
  combMix: 0.5,
  glitchMix: 0.5,
  filtMix: 0.5,
  stompMix: 0.5,
  dlyMix: 0.4,
  revMix: 0.3,
  brownAmt: 0.3,
  fbAmt: 0.45,
  mod0Src: 1,
  mod0Dest: 0,
  mod0Depth: 0.5,
}

const THEMES: Record<string, Palette> = {
  light: {
    bg: '#f6f8fa',
    fg: '#1f2328',
    dim: '#656d76',
    border: '#a8b1bb',
    accent: '#cf4520',
    accent2: '#9a6700',
    mod: '#2f6f9f',
    open: '#f6f8fa',
  },
  dark: {
    bg: '#161b22',
    fg: '#e6edf3',
    dim: '#8b949e',
    border: '#4d5560',
    accent: '#ff5d3b',
    accent2: '#d29922',
    mod: '#5ea9d8',
    open: '#161b22',
  },
}

export const DIAGRAMS = Object.keys(THEMES).map(name => `img/chain-${name}.svg`)

export function renderDiagrams(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(THEMES).map(([name, palette]) => [
      `img/chain-${name}.svg`,
      `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(
        drawMap(buildMap(BOARD, { palette, live: false })),
      )}\n`,
    ]),
  )
}

if (import.meta.main) {
  for (const [path, svg] of Object.entries(renderDiagrams())) {
    writeFileSync(path, svg)
    console.log(path)
  }
}

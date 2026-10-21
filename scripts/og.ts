import { pile } from '../src/site/pile.ts'
import { SHARE_SHOT } from '../src/site/shareShot.ts'
import { chromePath } from './chrome.ts'

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// `pnpm og` draws the landing page's pile, from the seed the server renders,
// into the picture a shared link unfurls with. Wants a Chrome and ImageMagick's
// `magick`.

const OUT = `public/${SHARE_SHOT.file}`
const { width, height } = SHARE_SHOT
const DPR = 2

const tokens = readFileSync('src/tokens.css', 'utf8')
const html = `<!doctype html>
<style>
${tokens}
html, body { margin: 0; background: var(--surface); }
svg { display: block; width: ${width}px; height: ${height}px; }
</style>
${pile()}`

const dir = mkdtempSync(join(tmpdir(), 'bender-og-'))
try {
  const page = join(dir, 'og.html')
  const shot = join(dir, 'og.png')
  writeFileSync(page, html)
  execFileSync(
    chromePath(),
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      `--user-data-dir=${join(dir, 'profile')}`,
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${DPR}`,
      `--screenshot=${shot}`,
      `file://${page}`,
    ],
    { stdio: 'ignore' },
  )
  execFileSync('magick', [
    shot,
    '-resize',
    `${width}x${height}!`,
    '-quality',
    '88',
    OUT,
  ])
  console.log(`${OUT} — ${width}x${height}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

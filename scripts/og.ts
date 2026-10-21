import { pile } from '../src/site/pile.ts'
import { SHARE_SHOT } from '../src/site/shareShot.ts'
import { chromePath } from './chrome.ts'

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// `pnpm og` draws the landing page's pile, from the seed the server renders,
// under a name plate into the picture a shared link unfurls with. Wants a
// Chrome and ImageMagick's `magick`.

const OUT = `public/${SHARE_SHOT.file}`
const { width, height } = SHARE_SHOT
const DPR = 2

const TAGLINE = 'circuit bending in the browser'

const sheet = (file: string) =>
  readFileSync(file, 'utf8').replace(/^@import .*$/m, '')
const html = `<!doctype html>
<style>
${sheet('src/tokens.css')}
${sheet('src/theme.css')}
html, body { margin: 0; background: var(--surface); font-family: var(--font); }
svg { display: block; width: ${width}px; height: ${height}px; }
.plate {
  position: absolute;
  left: 44px;
  bottom: 44px;
  padding: 18px 30px 22px;
  border: 1px solid var(--border-faint);
  border-left: 8px solid var(--accent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  box-shadow: 0 12px 40px #000c;
}
.name {
  margin: 0;
  color: var(--fg);
  font-size: 88px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
}
.tag {
  margin: 10px 0 0;
  color: var(--fg2);
  font-size: 32px;
}
</style>
${pile()}
<div class="plate">
  <p class="name">bender</p>
  <p class="tag">${TAGLINE}</p>
</div>`

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

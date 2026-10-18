import react from '@astrojs/react'
import { defineConfig } from 'astro/config'

import pkg from './package.json' with { type: 'json' }

import type { Plugin } from 'vite'

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKLET = fileURLToPath(new URL('./src/dsp/worklet.ts', import.meta.url))

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

function importClosure(entry: string, seen = new Set<string>()) {
  if (seen.has(entry)) return seen
  seen.add(entry)
  const source = readFileSync(entry, 'utf8')
  for (const [, spec] of source.matchAll(/from '(\.[^']+\.ts)'/g)) {
    importClosure(resolve(dirname(entry), spec!), seen)
  }
  return seen
}

// The worklet loads through `?worker&url`, outside the module graph the page
// hot-updates, so an edit under it changes nothing until the page reloads.
function reloadForWorklet(): Plugin {
  return {
    name: 'bender:reload-for-worklet',
    hotUpdate({ file, server }) {
      if (
        this.environment.name === 'client' &&
        importClosure(WORKLET).has(file)
      ) {
        server.hot.send({ type: 'full-reload', path: '*' })
        return []
      }
      return undefined
    },
  }
}

// Two pages: `/` is the homepage, static markup plus one small script, and the
// app it links to lives at `/app/`. GitHub Pages serves the repo under /bender/.
export default defineConfig({
  site: 'https://cmdcolin.github.io',
  base: '/bender',
  devToolbar: { enabled: false },
  compressHTML: false,
  integrations: [react()],
  vite: {
    plugins: [reloadForWorklet()],
    worker: { format: 'es' },
    server: {
      // Astro restarts on any changed file named `astro.config.*`, and agent
      // worktrees under `.claude/` each hold a copy.
      watch: {
        ignored: [fileURLToPath(new URL('.claude/**', import.meta.url))],
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __GIT_SHA__: JSON.stringify(gitSha()),
    },
  },
})

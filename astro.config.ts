import { execSync } from 'node:child_process'
import react from '@astrojs/react'
import { defineConfig } from 'astro/config'
import pkg from './package.json' with { type: 'json' }

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
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
    worker: { format: 'es' },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __GIT_SHA__: JSON.stringify(gitSha()),
    },
  },
})

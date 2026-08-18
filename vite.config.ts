import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defaultExclude, defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  base: '/bender/',
  plugins: [react()],
  worker: { format: 'es' },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_SHA__: JSON.stringify(gitSha()),
  },
  // Worktrees carry their own copy of the suite; running them here would report
  // another branch's work in progress as this branch's failure.
  // The dsp tests are cpu-bound and run beside twenty-nine other files, so the
  // stock five seconds fails them for waiting rather than for being wrong.
  test: {
    exclude: [...defaultExclude, '**/.claude/**'],
    testTimeout: 20000,
  },
})

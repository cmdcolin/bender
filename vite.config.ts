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
  test: { exclude: [...defaultExclude, '**/.claude/**'] },
})

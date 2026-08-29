// Bump the version, tag it, and push — the version is stamped into the build
// (vite.config.ts `define`) and shown in the panel masthead.
// Usage: node scripts/push.mjs <patch|minor|major>   (via pnpm {pat,min,maj})

import { execSync } from 'node:child_process'

const bump = process.argv[2]
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error(`usage: node scripts/push.mjs <patch|minor|major>`)
  process.exit(1)
}

function run(cmd) {
  console.log(`$ ${cmd}`)
  return execSync(cmd, { stdio: 'inherit' })
}

const dirty = execSync('git status --porcelain').toString().trim()
if (dirty) {
  console.error(
    'working tree is dirty — commit or discard changes before pushing a release',
  )
  process.exit(1)
}

// Catch what CI would catch, before it's a remote failure blocking the release.
for (const check of ['pnpm typecheck', 'pnpm test']) {
  run(check)
}

run(`pnpm version ${bump} -m "Release v%s"`)
run('git push --follow-tags')

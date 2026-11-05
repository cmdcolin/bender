import { getViteConfig } from 'astro/config'
import { defaultExclude } from 'vitest/config'

import { globSync, readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'

// Worktrees carry their own copy of the suite; running them here would report
// another branch's work in progress as this branch's failure. Anchored to
// this root rather than written `**/.claude/**`, because that one matches the
// path a worktree session is *standing in* — every test file under it, which
// is all of them — and the suite passes having run nothing.
// Several sessions run the suite at once, and a run that takes every core
// slows the others to a crawl, so each takes half.
// The dsp tests are cpu-bound and run beside twenty-nine other files, so the
// stock five seconds fails them for waiting rather than for being wrong.
// Each takes fifteen seconds or more of audio rendering. `pnpm test` skips
// them and CI runs them through `pnpm test:full`; naming one on the command
// line runs it too.
const SLOW = [
  'src/dsp/stages/toyDrum.test.ts',
  'src/dsp/tape.test.ts',
  'src/ui/presets/table.test.ts',
  'src/ui/presets/cuts.test.ts',
  'src/dsp/stages/fmEffects.test.ts',
  'src/dsp/misbehaviour.test.ts',
  'src/dsp/stages/fmChip.test.ts',
  'src/dsp/stages/amp.test.ts',
  'src/ui/presets/audible.test.ts',
  'src/dsp/stages/toyChip.test.ts',
  'src/ui/roll.test.tsx',
  'src/ui/presets/rigs.test.ts',
  'src/dsp/stages/ringmod.test.ts',
  'src/dsp/modbus.test.ts',
  'src/dsp/stages/tapeDelay.test.ts',
  'src/dsp/stages/fmStrobe.test.ts',
]
const full =
  !!process.env.BENDER_FULL ||
  process.argv.some(arg => SLOW.some(file => arg.endsWith(file)))
const SLOW_SKIPPED = full ? [] : SLOW

// A worker that runs one file and exits costs about 800 ms to start. Files in
// the node environment that leave no global behind can share a worker, which is
// most of the dsp suite; jsdom files and files that stub globals or timers each
// keep a fresh one.
const LEAVES_STATE =
  /vitest-environment jsdom|stubGlobal|vi\.mock|useFakeTimers|stubEnv|process\.env\.\w+ =/

const shared = globSync(
  ['src/**/*.test.{ts,tsx}', 'hardware/**/*.test.ts', 'scripts/**/*.test.ts'],
  { exclude: name => name.includes('node_modules') },
).filter(
  file =>
    !SLOW_SKIPPED.includes(file) &&
    !LEAVES_STATE.test(readFileSync(file, 'utf8')),
)

const base = {
  exclude: [...defaultExclude, '.claude/**', ...SLOW_SKIPPED],
  testTimeout: 40000,
  maxWorkers:
    Number(process.env.BENDER_MAX_WORKERS) ||
    Math.max(2, availableParallelism() >> 1),
}

export default getViteConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { ...base, name: 'shared', include: shared, isolate: false },
      },
      {
        extends: true,
        test: {
          ...base,
          name: 'isolated',
          exclude: [...base.exclude, ...shared],
        },
      },
    ],
  },
})

import { getViteConfig } from 'astro/config'
import { defaultExclude } from 'vitest/config'

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
export default getViteConfig({
  test: {
    exclude: [...defaultExclude, '.claude/**'],
    testTimeout: 40000,
    maxWorkers: Math.max(2, availableParallelism() >> 1),
  },
})

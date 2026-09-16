import { getViteConfig } from 'astro/config'
import { defaultExclude } from 'vitest/config'

// Worktrees carry their own copy of the suite; running them here would report
// another branch's work in progress as this branch's failure. Anchored to
// this root rather than written `**/.claude/**`, because that one matches the
// path a worktree session is *standing in* — every test file under it, which
// is all of them — and the suite passes having run nothing.
// The dsp tests are cpu-bound and run beside twenty-nine other files, so the
// stock five seconds fails them for waiting rather than for being wrong.
export default getViteConfig({
  test: {
    exclude: [...defaultExclude, '.claude/**'],
    testTimeout: 40000,
  },
})

import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderFeatures } from './features'

// The inventory is generated because a hand-written one drifts, and this is the
// half that makes that true: adding a control, a preset or a ROM without
// rerunning `pnpm features` fails here rather than shipping a doc that quietly
// undercounts the board.
test('docs/features.md is what the control tables say today — else `pnpm features`', async () => {
  expect(
    readFileSync(new URL('../docs/features.md', import.meta.url), 'utf8'),
  ).toBe(await renderFeatures())
})

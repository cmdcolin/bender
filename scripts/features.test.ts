import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderFeatures } from './features'
import { PRESETS } from '../src/ui/presets/table'
import { boardFromUrl, boardHash } from '../src/ui/share'
import { DEFAULT_CONTROLS, type ControlKey } from '../src/controls'

// The inventory is generated because a hand-written one drifts, and this is the
// half that makes that true: adding a control, a preset or a ROM without
// rerunning `pnpm features` fails here rather than shipping a doc that quietly
// undercounts the board.
test('docs/features.md is what the control tables say today — else `pnpm features`', async () => {
  expect(
    readFileSync(new URL('../docs/features.md', import.meta.url), 'utf8'),
  ).toBe(await renderFeatures())
})

// Every preset in the doc is a link, and a link is only worth printing if it
// still opens the board it names. The encoding is free to change; what cannot
// change is that a reader who clicks one lands on that preset.
test('every preset the doc links to opens that preset', () => {
  for (const preset of PRESETS) {
    const board = { ...DEFAULT_CONTROLS, ...preset.patch }
    const opened = boardFromUrl('', `#${boardHash('', board)}`) ?? {}
    for (const key of Object.keys(preset.patch) as ControlKey[]) {
      if (key === 'bodyX' || key === 'bodyY') continue
      expect(opened[key] ?? DEFAULT_CONTROLS[key]).toBeCloseTo(board[key], 3)
    }
  }
})

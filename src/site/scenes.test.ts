import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { INSTRUMENTS } from '../ui/bench.ts'
import { onBoard } from '../ui/chain-map.ts'
import { boardFrom, boardFromUrl } from '../ui/share.ts'
import { scenes } from './scenes.ts'

test('the scenes between them put every instrument on a bench', () => {
  const shown = new Set(
    scenes.flatMap(s => [
      ...onBoard(
        boardFrom(
          boardFromUrl('', s.href.slice(s.href.indexOf('#'))) ?? {},
          DEFAULT_CONTROLS,
        ),
      ),
    ]),
  )
  expect(INSTRUMENTS.filter(s => !shown.has(s))).toEqual([])
})

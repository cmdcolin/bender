// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { StompFace } from './StompFace.tsx'
import './testDom.ts'

test('a face keeps a slider its switch idles while the slider is off stock', () => {
  engine.writeBoard({ ...DEFAULT_CONTROLS, dlySync: 1 })
  render(
    <StompFace
      stage="Wraith"
      face={{ colour: '#000', sliders: ['delayMs', 'dlyMix'] }}
      seconds={0}
      footswitch={null}
      onOpen={() => {}}
      onClose={() => {}}
    />,
  )
  const time = () => screen.queryByRole('slider', { name: 'Time' })
  expect(time()).toBeNull()
  act(() => engine.set('delayMs', 900))
  expect(time()).not.toBeNull()
})

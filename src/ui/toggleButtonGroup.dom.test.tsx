// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { ToggleButtonGroup } from './ToggleButtonGroup.tsx'
import './testDom.ts'

test('the active option is pressed and a click reports the other one', () => {
  const onChange = vi.fn()
  render(
    <ToggleButtonGroup
      label="source"
      options={['random', 'search'] as const}
      value="random"
      onChange={onChange}
    />,
  )
  expect(screen.getByRole('button', { name: 'random' }).ariaPressed).toBe(
    'true',
  )
  expect(screen.getByRole('button', { name: 'search' }).ariaPressed).toBe(
    'false',
  )
  fireEvent.click(screen.getByRole('button', { name: 'search' }))
  expect(onChange).toHaveBeenCalledWith('search')
})

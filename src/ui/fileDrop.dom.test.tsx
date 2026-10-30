// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { App } from './App.tsx'
import { dragging } from './tapeDrop.ts'
import './testDom.ts'

const dragOver = (types: string[]) =>
  fireEvent.dragOver(screen.getByRole('main'), { dataTransfer: { types } })

test('only a file dragged over the app reads as a drop onto the tape', () => {
  const { unmount } = render(<App />)
  dragOver(['text/bend', 'text/plain'])
  expect(dragging.get()).toBe(false)
  dragOver(['Files'])
  expect(dragging.get()).toBe(true)
  dragging.set(false)
  unmount()
})

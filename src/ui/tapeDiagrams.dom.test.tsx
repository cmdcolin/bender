// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import { choiceValue, GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

const open = (name: string) => {
  const group = GROUPS.find(g => g.name === name)
  if (!group) throw new Error(`no ${name}`)
  return render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
}

const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))

test('the tape delay keeps Time, Feedback and the echo level as rows, and the rest behind its drawing', () => {
  open('Tape delay')
  for (const label of ['Time', 'Feedback', 'Echo level'])
    expect(screen.getAllByText(label), label).toHaveLength(1)
  expect(screen.queryByText('Heads')).toBeNull()
  expect(screen.queryByText('Splice')).toBeNull()
  press('heads controls')
  expect(screen.getAllByText('Heads')).toHaveLength(1)
  press('transport controls')
  expect(screen.queryByText('Heads')).toBeNull()
  expect(screen.getAllByText('Splice')).toHaveLength(1)
  press('loop controls')
  expect(screen.getAllByText('Loop filter')).toHaveLength(1)
})

test('the delay drawing puts a head at each multiple of the time', () => {
  act(() => engine.set('delayMs', 300))
  open('Tape delay')
  const drawing = screen.getByRole('img', { name: 'tape delay signal path' })
  expect(drawing.textContent).toContain('300 ms')
  expect(drawing.textContent).toContain('900 ms')
  act(() => engine.set('delayMs', 400))
  expect(drawing.textContent).not.toContain('300 ms')
  expect(drawing.textContent).toContain('1.20 s')
})

test('the tape machine keeps To tape, Tape at and Level as rows, and the heads and the tape behind its drawing', () => {
  open('Tape machine')
  for (const label of ['To tape', 'Tape at', 'Level'])
    expect(screen.getAllByText(label), label).toHaveLength(1)
  expect(screen.queryByText('Bias')).toBeNull()
  press('rec head controls')
  expect(screen.getAllByText('Bias')).toHaveLength(1)
  press('tape controls')
  expect(screen.queryByText('Bias')).toBeNull()
  for (const label of ['Format', 'Speed', 'Hiss'])
    expect(screen.getAllByText(label), label).toHaveLength(1)
})

test('the machine drawing says where it sits and what noise reduction it runs', () => {
  act(() => {
    engine.set('tapeAt', choiceValue('tapeAt', 'the pedals'))
    engine.set('tapeNrRec', choiceValue('tapeNrRec', 'dbx'))
  })
  open('Tape machine')
  const text = screen.getByRole('img', {
    name: 'tape machine signal path',
  }).textContent
  expect(text).toContain('sits ahead of the pedals')
  expect(text).toContain('dbx')
})

test('the delay drawing goes dark when the pedal is bypassed', () => {
  act(() => {
    engine.set('dlyMute', 0)
    engine.set('dlyMix', 0.5)
  })
  open('Tape delay')
  const drawing = screen.getByRole('img', { name: 'tape delay signal path' })
  const lit = () =>
    [...drawing.querySelectorAll('path')].filter(p =>
      p.getAttribute('class')?.includes('wireOn'),
    ).length
  expect(lit()).toBeGreaterThan(0)
  act(() => engine.set('dlyMute', 1))
  expect(lit()).toBe(0)
  act(() => {
    engine.set('dlyMute', 0)
    engine.set('dlyMix', 0)
  })
})

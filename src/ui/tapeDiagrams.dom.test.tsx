// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { engine } from '../engine/engine'
import { choiceValue, GROUPS } from './controls'
import { OpenGroup } from './Section'
import './testDom'

const open = (name: string) => {
  const group = GROUPS.find(g => g.name === name)
  if (!group) throw new Error(`no ${name}`)
  return render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
}

const fold = (name: string) =>
  [...document.querySelectorAll('details')].find(d =>
    d.querySelector('summary')?.textContent?.startsWith(name),
  )

test('the tape delay opens on its everyday knobs, with the rest folded', () => {
  open('Tape delay')
  for (const label of ['Time', 'Heads', 'Feedback', 'Tone', 'Echo level'])
    expect(screen.getAllByText(label), label).toHaveLength(1)
  expect(fold('the transport')?.open).toBe(false)
  expect(fold('in the loop')?.open).toBe(false)
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

test('the tape machine opens on its everyday knobs, with the rest folded', () => {
  open('Tape machine')
  for (const label of ['To tape', 'Speed', 'Tape at', 'Format', 'Level'])
    expect(screen.getAllByText(label), label).toHaveLength(1)
  expect(fold('the medium')?.open).toBe(false)
  expect(fold('record and replay')?.open).toBe(false)
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

import { expect, test } from 'vitest'
import {
  EMPTY_HISTORY,
  HISTORY_MAX,
  record,
  stepBack,
  stepForward,
  type History,
} from './history'

const same = (a: string, b: string) => a === b
const of = (past: string[], future: string[] = []): History<string> => ({
  past,
  future,
})

test('records what is being replaced, oldest first', () => {
  const h = record(record(EMPTY_HISTORY, 'a', same), 'b', same)
  expect(h.past).toEqual(['a', 'b'])
})

test('a board banked twice over is one step, not two', () => {
  const h = record(record(EMPTY_HISTORY, 'a', same), 'a', same)
  expect(h.past).toEqual(['a'])
})

test('caps the walk, dropping the oldest', () => {
  let h: History<string> = EMPTY_HISTORY
  for (let i = 0; i < HISTORY_MAX + 5; i++) h = record(h, `board ${i}`, same)
  expect(h.past).toHaveLength(HISTORY_MAX)
  expect(h.past[0]).toBe(`board 5`)
})

test('stepping back and forward retraces the same walk', () => {
  const h = of(['a', 'b'])
  const back = stepBack(h, 'live')
  expect(back?.value).toBe('b')
  expect(back?.history).toEqual(of(['a'], ['live']))

  const forward = stepForward(back!.history, back!.value)
  expect(forward?.value).toBe('live')
  expect(forward?.history).toEqual(of(['a', 'b']))
})

test('offers nothing at either end of the walk', () => {
  expect(stepBack(EMPTY_HISTORY, 'live')).toBeNull()
  expect(stepForward(EMPTY_HISTORY, 'live')).toBeNull()
})

// Where a redo tail has to die: it described a walk this board is no longer on.
test('a fresh board after undo ends the walk forward', () => {
  const h = of(['a'], ['b'])
  expect(record(h, 'c', same).future).toEqual([])
})

// Even when the write banks nothing new — the dedupe is about duplicate entries,
// not about whether the walk forward still applies.
test('a duplicate banked after undo still ends the walk forward', () => {
  const h = of(['a'], ['b'])
  const next = record(h, 'a', same)
  expect(next.past).toEqual(['a'])
  expect(next.future).toEqual([])
})

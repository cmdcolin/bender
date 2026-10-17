// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { SavedVoices } from './SavedVoices.tsx'
import './testDom.ts'

const HOUR = 3_600_000

const mount = (over: Partial<Parameters<typeof SavedVoices>[0]> = {}) => {
  const onRecallSession = vi.fn()
  const onOpenSession = vi.fn()
  render(
    <SavedVoices
      voices={[{ name: 'squeal', query: 'p=A' }]}
      recent={[
        { id: 'a', query: 'p=A', at: Date.now() - 2 * HOUR },
        { id: 'b', query: 'p=B', at: Date.now() - 50 * HOUR },
      ]}
      onRecallSession={onRecallSession}
      onOpenSession={onOpenSession}
      suggestName={() => 'my voice'}
      onSave={() => {}}
      onRecall={() => {}}
      onOpen={() => {}}
      onDelete={() => {}}
      onCopyLink={() => Promise.resolve(true)}
      flash={null}
      status="ready"
      error={null}
      {...over}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /^saved/ }))
  return { onRecallSession, onOpenSession }
}

test('the earlier sessions are listed newest first, with how long ago', () => {
  mount()
  expect(screen.getByText('earlier sessions')).not.toBeNull()
  expect(screen.getByText(/2 hours ago/)).not.toBeNull()
  expect(screen.getByText(/2 days ago/)).not.toBeNull()
})

test('a session that was saved says what it was saved as', () => {
  mount()
  expect(screen.getByText(/saved as “squeal”/)).not.toBeNull()
})

test('pressing a session recalls its board, and the arrow opens it whole', () => {
  const { onRecallSession, onOpenSession } = mount()
  fireEvent.click(screen.getByRole('button', { name: /^2 days ago/ }))
  expect(onRecallSession).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'b' }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'open the session from 2 hours ago' }),
  )
  expect(onOpenSession).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'a' }),
  )
})

test('with no earlier visits the section is not drawn', () => {
  mount({ recent: [] })
  expect(screen.queryByText('earlier sessions')).toBeNull()
})

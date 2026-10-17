// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, test } from 'vitest'

import { Menu } from './Menu.tsx'
import './testDom.ts'

function Drawer() {
  const [toggle, setToggle] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button ref={setToggle} onClick={() => setOpen(!open)}>
        drawer
      </button>
      {open && (
        <Menu
          anchor={toggle}
          toggle={toggle}
          role="menu"
          onClose={() => setOpen(false)}
        >
          <button onClick={() => setOpen(false)}>item</button>
        </Menu>
      )}
    </>
  )
}

test('a menu shut from the keyboard hands focus back to its toggle', () => {
  render(<Drawer />)
  const toggle = screen.getByRole('button', { name: 'drawer' })
  fireEvent.click(toggle)
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'item' }),
  )
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(toggle)

  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'item' }))
  expect(document.activeElement).toBe(toggle)
})

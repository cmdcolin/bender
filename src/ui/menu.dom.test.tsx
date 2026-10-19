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

test('the arrow keys walk a menu and wrap at the ends', () => {
  render(
    <Menu anchor={null} toggle={null} role="menu" onClose={() => {}}>
      <button role="menuitem">one</button>
      <button role="menuitem">two</button>
      <button role="menuitem">three</button>
    </Menu>,
  )
  const menu = screen.getByRole('menu', { hidden: true })
  const item = (name: string) => screen.getByRole('menuitem', { name })
  expect(document.activeElement).toBe(item('one'))
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(item('two'))
  fireEvent.keyDown(menu, { key: 'End' })
  expect(document.activeElement).toBe(item('three'))
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(item('one'))
  fireEvent.keyDown(menu, { key: 'ArrowUp' })
  expect(document.activeElement).toBe(item('three'))
  fireEvent.keyDown(menu, { key: 'Home' })
  expect(document.activeElement).toBe(item('one'))
})

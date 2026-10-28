import { useState } from 'react'

import { Menu } from './Menu.tsx'
import { menuItem, menuSection } from './menuItems.ts'

export interface AddChoice {
  stage: string
  kind: string
  section?: string
}

export function AddMenu({
  className,
  text,
  choices,
  onPick,
}: {
  className?: string
  text: string
  choices: AddChoice[]
  onPick: (stage: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  if (choices.length === 0) return null
  return (
    <>
      <button
        ref={setButton}
        className={className}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {text} ▾
      </button>
      {open && (
        <Menu
          anchor={button}
          toggle={button}
          role="menu"
          label={text}
          onClose={() => setOpen(false)}
        >
          {choices.map(({ stage, kind, section }, i) => [
            section && section !== choices[i - 1]?.section && (
              <div
                key={`section:${section}`}
                role="presentation"
                className={menuSection}
              >
                {section}
              </div>
            ),
            <button
              key={stage}
              role="menuitem"
              className={menuItem(false)}
              onClick={() => {
                if (choices.length === 1) setOpen(false)
                onPick(stage)
              }}
            >
              {stage} ({kind})
            </button>,
          ])}
        </Menu>
      )}
    </>
  )
}

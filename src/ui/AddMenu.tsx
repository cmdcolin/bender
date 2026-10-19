import { useState } from 'react'

import { Menu } from './Menu.tsx'
import { menuItem } from './menuItems.ts'

export interface AddChoice {
  stage: string
  kind: string
}

/** A button that opens a list of what is not on the bench yet, each named with
    what it is: "Glint (FM synth)". The list stays up for the next pick and
    shuts on the last one. */
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
          {choices.map(({ stage, kind }) => (
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
            </button>
          ))}
        </Menu>
      )}
    </>
  )
}

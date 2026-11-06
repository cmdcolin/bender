import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import { CHANNELS } from './controls/index.ts'
import {
  intoOf,
  JACK_NAMES,
  MASTER,
  patchedInto,
  UNITS,
} from './controls/jacks.ts'
import { useBoardValue } from './ControlsContext.ts'
import styles from './JackCap.module.css'
import { Menu } from './Menu.tsx'
import { Tip } from './Tip.tsx'

import type { ControlKey, Controls } from '../controls.ts'

const JACK_GLYPH = (
  <svg className={styles.glyph} viewBox="0 0 12 12" aria-hidden="true">
    <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" />
    <circle cx="6" cy="6" r="1.8" />
  </svg>
)

const MACHINES = new Set(CHANNELS.map(c => c.name))

const plug = (key: ControlKey, machine: string) => {
  engine.armStep()
  engine.set(key, Math.max(JACK_NAMES.indexOf(machine), 0))
}

const unitsOn = (c: Controls, machine: string) =>
  UNITS.filter(u => patchedInto(c[u.into]) === machine)
    .map(u => u.group)
    .join(', ')

function UnitJack({ stage, into }: { stage: string; into: ControlKey }) {
  const machine = useBoardValue(c => patchedInto(c[into]))
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = () => setOpen(false)
  return (
    <>
      <Tip
        text={
          machine
            ? `${stage} is patched into ${machine} and processes it alone. Press to move the cable.`
            : `Patch ${stage} into one machine’s output instead of the whole mix.`
        }
      >
        <button
          ref={setButton}
          className={machine ? styles.capOn : styles.cap}
          data-control={into}
          aria-label={`patch ${stage} into`}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {JACK_GLYPH}
          {machine && <span className={styles.name}>{machine}</span>}
        </button>
      </Tip>
      {open && (
        <Menu
          anchor={button}
          toggle={button}
          role="menu"
          label={`patch ${stage} into`}
          onClose={close}
        >
          <div className={styles.list}>
            {JACK_NAMES.map(name => {
              const here = (machine ?? MASTER) === name
              return (
                <button
                  key={name}
                  role="menuitem"
                  className={here ? styles.itemOn : styles.item}
                  aria-current={here || undefined}
                  onClick={() => {
                    close()
                    plug(into, name)
                  }}
                >
                  {name === MASTER ? 'master (the whole mix)' : name}
                </button>
              )
            })}
          </div>
        </Menu>
      )}
    </>
  )
}

function MachineJack({ stage }: { stage: string }) {
  const here = useBoardValue(c => unitsOn(c, stage))
  const elsewhere = useBoardValue(c =>
    UNITS.map(u => patchedInto(c[u.into]) ?? '').join('|'),
  ).split('|')
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = () => setOpen(false)
  return (
    <>
      <Tip
        text={
          here
            ? `${here} ${here.includes(',') ? 'are' : 'is'} patched into ${stage}’s output. Press to patch or unplug units.`
            : `Patch a pedal or bend into ${stage}’s output alone.`
        }
      >
        <button
          ref={setButton}
          className={here ? styles.capOn : styles.cap}
          aria-label={`patch into ${stage}`}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {JACK_GLYPH}
          {here && <span className={styles.name}>{here}</span>}
        </button>
      </Tip>
      {open && (
        <Menu
          anchor={button}
          toggle={button}
          role="menu"
          label={`patch into ${stage}`}
          onClose={close}
        >
          <div className={styles.list}>
            {UNITS.map((u, i) => {
              const on = elsewhere[i]
              const mine = on === stage
              return (
                <button
                  key={u.group}
                  role="menuitemcheckbox"
                  aria-checked={mine}
                  className={mine ? styles.itemOn : styles.item}
                  onClick={() => {
                    close()
                    plug(u.into, mine ? MASTER : stage)
                  }}
                >
                  {u.group}
                  {on && !mine && <span className={styles.on}>on {on}</span>}
                </button>
              )
            })}
          </div>
        </Menu>
      )}
    </>
  )
}

/** The jack on a pedal or bend, naming the machine it is patched into, and on
    a machine, naming what is patched into it. */
export function JackCap({ stage }: { stage: string }) {
  const into = intoOf(stage)
  return into ? (
    <UnitJack stage={stage} into={into} />
  ) : MACHINES.has(stage) ? (
    <MachineJack stage={stage} />
  ) : null
}

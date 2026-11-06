import { useState } from 'react'

import { MIC } from '../dsp/micJacks.ts'
import { engine } from '../engine/engine.ts'
import { TAP_MIC } from '../engine/params.ts'
import { jackOf } from '../jacks.ts'
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
import { wireOn } from './micWiring.ts'
import { Tip } from './Tip.tsx'

import type { ControlKey, Controls } from '../controls.ts'

const PLUG_GLYPH = (
  <svg className={styles.glyph} viewBox="0 0 12 12" aria-hidden="true">
    <path d="M0 6h3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <rect x="3" y="3.5" width="4.5" height="5" rx="1" />
    <rect x="7.5" y="5" width="2.5" height="2" />
    <path d="M10 5.2h1.1l.9.8-.9.8H10z" />
  </svg>
)

const MACHINES = new Set(CHANNELS.map(c => c.name))

const MIC_JACK = JACK_NAMES[jackOf(TAP_MIC)]

/** Whether units patched onto the mic hear nothing, with no mic wire on the
    mix to hand them a line. */
const micDeaf = (c: Controls) => wireOn(c, MIC.mix) === 0

const DEAF = 'the mic isn’t wired to the mix, so it hears nothing'

const plug = (key: ControlKey, machine: string) => {
  engine.armStep()
  engine.set(key, Math.max(JACK_NAMES.indexOf(machine), 0))
}

const unitsOn = (c: Controls, machine: string) =>
  UNITS.filter(u => patchedInto(c[u.into]) === machine)
    .map(u => u.group)
    .join(', ')

function UnitJack({
  stage,
  into,
  idle,
}: {
  stage: string
  into: ControlKey
  idle: string
}) {
  const machine = useBoardValue(c => patchedInto(c[into]))
  const deaf = useBoardValue(micDeaf)
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = () => setOpen(false)
  return (
    <>
      <Tip
        text={
          machine === MIC_JACK && deaf
            ? `${stage} is patched into the Mic, but ${DEAF}. Press to move the cable.`
            : machine
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
          {PLUG_GLYPH}
          {(machine ?? idle) && (
            <span className={styles.name}>{machine ?? idle}</span>
          )}
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
                  role="menuitemradio"
                  className={here ? styles.itemOn : styles.item}
                  aria-checked={here}
                  onClick={() => {
                    close()
                    plug(into, name)
                  }}
                >
                  {name === MASTER ? 'master (the whole mix)' : name}
                  {name === MIC_JACK && deaf && (
                    <span className={styles.on}>
                      hears nothing: not on the mix
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Menu>
      )}
    </>
  )
}

function MachineJack({ stage, idle }: { stage: string; idle: string }) {
  const here = useBoardValue(c => unitsOn(c, stage))
  const deaf = useBoardValue(c => stage === MIC_JACK && micDeaf(c))
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
          (here
            ? `${here} ${here.includes(',') ? 'are' : 'is'} patched into ${stage}’s output. Press to patch or unplug units.`
            : `Patch a pedal or bend into ${stage}’s output alone.`) +
          (deaf
            ? ' The mic isn’t wired to the mix, so units patched here hear nothing.'
            : '')
        }
      >
        <button
          ref={setButton}
          className={here ? styles.capOn : styles.cap}
          aria-label={`patch into ${stage}`}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {PLUG_GLYPH}
          {(here || idle) && (
            <span className={styles.name}>{here || idle}</span>
          )}
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
export function JackCap({
  stage,
  compact = false,
}: {
  stage: string
  /** Names the cap only once something is patched through it. */
  compact?: boolean
}) {
  const into = intoOf(stage)
  const idle = compact ? '' : 'insert'
  return into ? (
    <UnitJack stage={stage} into={into} idle={idle} />
  ) : MACHINES.has(stage) ? (
    <MachineJack stage={stage} idle={idle} />
  ) : null
}

import { useState } from 'react'

import { MIC } from '../dsp/micJacks.ts'
import { engine } from '../engine/engine.ts'
import { TAP_MIC } from '../engine/params.ts'
import { lineOf } from '../jacks.ts'
import { CHANNELS } from './controls/index.ts'
import {
  intoOf,
  LINE_NAMES,
  lineNamed,
  patchedLabel,
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

const MIC_LINE = lineOf(TAP_MIC)

const micDeaf = (c: Controls) => wireOn(c, MIC.mix) === 0

const DEAF = 'the mic isn’t wired to the mix, so it hears nothing'

const patch = (key: ControlKey, lines: number) => {
  engine.armStep()
  engine.set(key, lines)
}

const unitsOn = (c: Controls, bit: number) =>
  UNITS.filter(u => (Math.round(c[u.into]) & bit) !== 0)
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
  const lines = useBoardValue(c => Math.round(c[into]))
  const label = patchedLabel(lines)
  const onMic = (lines & MIC_LINE) !== 0
  const deaf = useBoardValue(micDeaf)
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = () => setOpen(false)
  return (
    <>
      <Tip
        text={
          onMic && deaf
            ? `${stage} is patched into ${label}, but ${DEAF}. Press to change its lines.`
            : label
              ? `${stage} is patched into ${label} and processes those lines before the mix bus. Press to change its lines.`
              : `Patch ${stage} into one or more machines’ outputs instead of the whole mix.`
        }
      >
        <button
          ref={setButton}
          className={label ? styles.capOn : styles.cap}
          data-control={into}
          aria-label={`patch ${stage} into`}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {PLUG_GLYPH}
          {(label ?? idle) && (
            <span className={styles.name}>{label ?? idle}</span>
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
            <button
              role="menuitemradio"
              className={lines === 0 ? styles.itemOn : styles.item}
              aria-checked={lines === 0}
              onClick={() => {
                close()
                patch(into, 0)
              }}
            >
              master (the whole mix)
            </button>
            {LINE_NAMES.map(name => {
              const bit = lineNamed(name)
              const here = (lines & bit) !== 0
              return (
                <button
                  key={name}
                  role="menuitemcheckbox"
                  className={here ? styles.itemOn : styles.item}
                  aria-checked={here}
                  onClick={() => patch(into, lines ^ bit)}
                >
                  {name}
                  {bit === MIC_LINE && deaf && (
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
  const bit = lineNamed(stage)
  const here = useBoardValue(c => unitsOn(c, bit))
  const deaf = useBoardValue(c => bit === MIC_LINE && micDeaf(c))
  const elsewhere = useBoardValue(c =>
    UNITS.map(u => String(Math.round(c[u.into]))).join('|'),
  )
    .split('|')
    .map(Number)
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = () => setOpen(false)
  return (
    <>
      <Tip
        text={
          (here
            ? `${here} ${here.includes(',') ? 'are' : 'is'} patched into ${stage}’s output. Press to patch or unplug units.`
            : `Patch a pedal or bend into ${stage}’s output.`) +
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
              const lines = elsewhere[i] ?? 0
              const mine = (lines & bit) !== 0
              const others = patchedLabel(lines & ~bit)
              return (
                <button
                  key={u.group}
                  role="menuitemcheckbox"
                  aria-checked={mine}
                  className={mine ? styles.itemOn : styles.item}
                  onClick={() => patch(u.into, lines ^ bit)}
                >
                  {u.group}
                  {others && (
                    <span className={styles.on}>
                      {mine ? `and ${others}` : `on ${others}`}
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

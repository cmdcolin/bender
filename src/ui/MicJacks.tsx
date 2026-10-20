import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import { useControlValue, useStoreValue } from './ControlsContext.ts'
import { Menu } from './Menu.tsx'
import styles from './MicJacks.module.css'
import { BY_STAGE, jacksOn, MIC_JACKS } from './micWiring.ts'
import { plugMic } from './plugMic.ts'
import { Tip } from './Tip.tsx'

const MIC_GLYPH = (
  <svg className={styles.glyph} viewBox="0 0 12 12" aria-hidden="true">
    <rect x="4" y="0.5" width="4" height="7" rx="2" />
    <path d="M2.5 6a3.5 3.5 0 0 0 7 0H9a3 3 0 0 1-6 0Z" />
    <rect x="5.5" y="9" width="1" height="2" />
    <rect x="3.5" y="11" width="5" height="1" />
  </svg>
)

function useSoldered(): number {
  const on = useStoreValue(engine.micOn)
  const jack = Math.round(useControlValue('micPatch'))
  const level = useControlValue('micLevel')
  return on && level > 0 ? jack : -1
}

function JackItems({
  jacks,
  live,
  withStage,
  onPick,
}: {
  jacks: number[]
  live: number
  withStage: boolean
  onPick: () => void
}) {
  return jacks.map(i => {
    const { name, stage, says } = MIC_JACKS[i]!
    return (
      <button
        key={i}
        role="menuitem"
        className={i === live ? styles.itemOn : styles.item}
        aria-label={`solder the mic to ${name}`}
        onClick={() => {
          onPick()
          plugMic(i)
        }}
      >
        <span className={styles.name}>
          {name}
          {withStage && stage !== 'mix' && (
            <span className={styles.stage}> · {stage}</span>
          )}
        </span>
        <span className={styles.says}>{says}</span>
      </button>
    )
  })
}

function Unplug({ onPick }: { onPick: () => void }) {
  return (
    <button
      role="menuitem"
      className={styles.item}
      onClick={() => {
        onPick()
        engine.disableMic()
      }}
    >
      <span className={styles.name}>close the mic</span>
    </button>
  )
}

/** A cap on a stage with mic jacks: lit while the open mic is soldered to one
    of them, and pressed it lists them with what a voice does at each. */
export function MicCap({ stage }: { stage: string }) {
  const jacks = jacksOn(stage)
  const live = useSoldered()
  const error = useStoreValue(engine.micError)
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = () => setOpen(false)
  if (jacks.length === 0) return null
  const here = jacks.includes(live)
  return (
    <>
      <Tip
        text={
          error ||
          (here
            ? `The mic is soldered to ${MIC_JACKS[live]!.name}. Pick another jack or close the mic.`
            : `Sing, talk or yell into ${stage}: ${jacks.length === 1 ? 'one jack' : `${jacks.length} jacks`} for the mic.`)
        }
      >
        <button
          ref={setButton}
          className={here ? styles.capOn : styles.cap}
          aria-label={`mic into ${stage}`}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {MIC_GLYPH}
        </button>
      </Tip>
      {open && (
        <Menu
          anchor={button}
          toggle={button}
          role="menu"
          label={`mic into ${stage}`}
          onClose={close}
        >
          <JackItems
            jacks={jacks}
            live={live}
            withStage={false}
            onPick={close}
          />
          {here && <Unplug onPick={close} />}
        </Menu>
      )}
    </>
  )
}

const rank = (i: number) => BY_STAGE.indexOf(MIC_JACKS[i]!.stage)
const ALL = MIC_JACKS.map((_, i) => i).toSorted((a, b) => rank(a) - rank(b))

/** The bench bar's list of every mic jack on the board. */
export function MicMenu({ className }: { className?: string }) {
  const live = useSoldered()
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = () => setOpen(false)
  return (
    <>
      <Tip text="Solder the microphone into the circuit: the clock, a bus, a trigger line or a synth’s input.">
        <button
          ref={setButton}
          className={className}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {MIC_GLYPH} Mic into ▾
        </button>
      </Tip>
      {open && (
        <Menu
          anchor={button}
          toggle={button}
          role="menu"
          label="mic into"
          onClose={close}
        >
          <div className={styles.list}>
            <JackItems jacks={ALL} live={live} withStage onPick={close} />
          </div>
          {live >= 0 && <Unplug onPick={close} />}
        </Menu>
      )}
    </>
  )
}

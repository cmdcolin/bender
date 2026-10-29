import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import { useControlValue, useStoreValue } from './ControlsContext.ts'
import { Menu } from './Menu.tsx'
import styles from './MicJacks.module.css'
import { JACKS_BY_STAGE, jacksOn, MIC_JACKS } from './micWiring.ts'
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

const where = (i: number) => {
  const { stage, part } = MIC_JACKS[i]!
  return stage === 'mix' ? 'the mix bus' : `${stage}’s ${part}`
}

const orList = (words: string[]) =>
  words.length < 2
    ? words.join('')
    : `${words.slice(0, -1).join(', ')} or ${words.at(-1)!}`

function useLiveJack(): number {
  const on = useStoreValue(engine.micOn)
  const jack = Math.round(useControlValue('micPatch'))
  const level = useControlValue('micLevel')
  return on && level > 0 ? jack : -1
}

function Jack({
  jack,
  live,
  onPick,
}: {
  jack: number
  live: number
  onPick: () => void
}) {
  const { part, says } = MIC_JACKS[jack]!
  const on = jack === live
  return (
    <button
      role="menuitem"
      className={on ? styles.itemOn : styles.item}
      aria-label={`solder the mic to ${where(jack)}`}
      aria-current={on || undefined}
      onClick={() => {
        onPick()
        plugMic(jack)
      }}
    >
      <span className={styles.part}>
        {part}
        {on && <span className={styles.live}>plugged in</span>}
      </span>
      <span className={styles.says}>{says}</span>
    </button>
  )
}

// What closes the menu's list: the way to unplug once the mic is in, and why
// the browser refused it when it did.
function Foot({ live, onPick }: { live: number; onPick: () => void }) {
  const error = useStoreValue(engine.micError)
  if (live < 0 && !error) return null
  return (
    <div className={styles.foot}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {live >= 0 && (
        <button
          role="menuitem"
          className={styles.command}
          onClick={() => {
            onPick()
            engine.disableMic()
          }}
        >
          close the mic
        </button>
      )}
    </div>
  )
}

/** A cap on a stage with mic jacks: lit while the open mic is soldered to one
    of them, and pressed it lists them with what a voice does at each. */
export function MicCap({ stage }: { stage: string }) {
  const jacks = jacksOn(stage)
  const live = useLiveJack()
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = () => setOpen(false)
  if (jacks.length === 0) return null
  const here = jacks.includes(live)
  return (
    <>
      <Tip
        text={
          here
            ? `The mic is in ${where(live)}. Press for the other jacks or to close the mic.`
            : `Plug the mic into ${stage}’s ${orList(jacks.map(j => MIC_JACKS[j]!.part))}.`
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
          {jacks.map(j => (
            <Jack key={j} jack={j} live={live} onPick={close} />
          ))}
          <Foot live={here ? live : -1} onPick={close} />
        </Menu>
      )}
    </>
  )
}

/** The bench bar's list of every mic jack on the board, under the machine it
    sits on. */
export function MicMenu({ className }: { className?: string }) {
  const live = useLiveJack()
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = () => setOpen(false)
  return (
    <>
      <Tip text="Plug the microphone into the circuit: a clock pin, a bus, a trigger line or a synth’s input.">
        <button
          ref={setButton}
          className={className}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {MIC_GLYPH} mic into ▾
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
            {JACKS_BY_STAGE.map(({ stage, kind, jacks }) => (
              <div key={stage} role="group" aria-label={stage}>
                <div className={styles.heading} aria-hidden="true">
                  {stage === 'mix' ? 'Mix bus' : stage}
                  {kind && <span className={styles.kind}> ({kind})</span>}
                </div>
                {jacks.map(j => (
                  <Jack key={j} jack={j} live={live} onPick={close} />
                ))}
              </div>
            ))}
          </div>
          <Foot live={live} onPick={close} />
        </Menu>
      )}
    </>
  )
}

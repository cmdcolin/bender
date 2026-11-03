import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import { useControlValue, useStoreValue } from './ControlsContext.ts'
import { Menu } from './Menu.tsx'
import styles from './MicJacks.module.css'
import { JACKS_BY_STAGE, jacksOn, MIC_JACKS } from './micWiring.ts'
import { plugMic, plugSecond, unplugSecond } from './plugMic.ts'
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

interface Live {
  first: number
  second: number
}

function useLive(): Live {
  const on = useStoreValue(engine.micOn)
  const first = Math.round(useControlValue('micPatch'))
  const second = Math.round(useControlValue('micPatch2')) - 1
  const level = useControlValue('micLevel')
  const live = on && level > 0
  return {
    first: live ? first : -1,
    second: live && second !== first ? second : -1,
  }
}

function Jack({
  jack,
  live,
  onPick,
}: {
  jack: number
  live: Live
  onPick: () => void
}) {
  const { part, says } = MIC_JACKS[jack]!
  const first = jack === live.first
  const second = jack === live.second
  return (
    <div className={styles.row}>
      <button
        role="menuitem"
        className={first || second ? styles.itemOn : styles.item}
        aria-label={`solder the mic to ${where(jack)}`}
        aria-current={first || second || undefined}
        onClick={() => {
          onPick()
          plugMic(jack)
        }}
      >
        <span className={styles.part}>
          {part}
          {first && <span className={styles.live}>plugged in</span>}
          {second && <span className={styles.live}>second wire</span>}
        </span>
        <span className={styles.says}>{says}</span>
      </button>
      {live.first >= 0 && !first && (
        <Tip
          text={
            second
              ? `Takes the second wire off ${where(jack)}.`
              : `Solders a second wire to ${where(jack)}, so the mic drives it as well as ${where(live.first)}.`
          }
        >
          <button
            role="menuitem"
            className={second ? styles.alsoOn : styles.also}
            aria-label={
              second
                ? `unplug the second wire from ${where(jack)}`
                : `solder the second wire to ${where(jack)}`
            }
            onClick={() => {
              onPick()
              if (second) unplugSecond()
              else plugSecond(jack)
            }}
          >
            {second ? '− 2nd' : '+ 2nd'}
          </button>
        </Tip>
      )}
    </div>
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
  const live = useLive()
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const close = () => setOpen(false)
  if (jacks.length === 0) return null
  const heard = [live.first, live.second].filter(j => jacks.includes(j))
  const here = heard.length > 0
  return (
    <>
      <Tip
        text={
          here
            ? `The mic is in ${orList(heard.map(where))}. Press for the other jacks or to close the mic.`
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
          <Foot live={here ? live.first : -1} onPick={close} />
        </Menu>
      )}
    </>
  )
}

/** The bench bar's list of every mic jack on the board, under the machine it
    sits on. */
export function MicMenu({ className }: { className?: string }) {
  const live = useLive()
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
          <Foot live={live.first} onPick={close} />
        </Menu>
      )}
    </>
  )
}

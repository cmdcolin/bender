import { useEffect, useRef, useState } from 'react'

import { POOLS } from '../engine/archive.ts'
import { engine } from '../engine/engine.ts'
import { CHANNELS, sliderFor, snapToStep } from '../ui/controls/index.ts'
import { useControlValue, useStoreValue } from '../ui/ControlsContext.ts'
import { mutate } from '../ui/presets/index.ts'
import rangeStyles from '../ui/range.module.css'
import { fromPos, toPos } from '../ui/slider-scale.ts'
import styles from './pocket.module.css'

import type { ControlKey } from '../controls.ts'
import type { CSSProperties, ReactNode } from 'react'

const STEPS = 1000

const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars

function Sheet(props: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(props.onClose)
  useEffect(() => {
    onCloseRef.current = props.onClose
  })
  useEffect(() => {
    const before = document.activeElement
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (before instanceof HTMLElement) before.focus()
    }
  }, [])
  return (
    <div
      className={styles.sheet}
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
    >
      <div className={styles.sheetHead}>
        <span className={styles.sheetTitle}>{props.title}</span>
        <button
          ref={closeRef}
          className={styles.close}
          aria-label="close"
          onClick={props.onClose}
        >
          ✕
        </button>
      </div>
      {props.children}
    </div>
  )
}

function Fader(props: {
  label: string
  value: number
  onInput: (v: number) => void
  readout?: string
}) {
  const pct = `${props.value * 100}%`
  return (
    <label className={styles.fader}>
      <span className={styles.faderLabel}>{props.label}</span>
      <input
        type="range"
        className={rangeStyles.track}
        style={cssVars({
          '--lo': '0%',
          '--hi': pct,
          '--def': '0%',
          '--def-tick': 'transparent',
        })}
        min={0}
        max={STEPS}
        onPointerDown={() => engine.armStep()}
        value={Math.round(props.value * STEPS)}
        onChange={e => props.onInput(Number(e.currentTarget.value) / STEPS)}
      />
      <span className={styles.faderValue}>
        {props.readout ?? Math.round(props.value * 100)}
      </span>
    </label>
  )
}

function LevelFader(props: { k: ControlKey; label: string }) {
  const def = sliderFor(props.k)
  const value = useControlValue(props.k)
  return (
    <Fader
      label={props.label}
      value={toPos(def, value)}
      onInput={pos => engine.set(props.k, snapToStep(def, fromPos(def, pos)))}
    />
  )
}

// How far toward the preset the board stands, and the three verbs that move a
// whole board a little.
export function TuneSheet(props: {
  title: string
  strength: number | null
  onStrength: (t: number) => void
  onClose: () => void
}) {
  const drifting = useStoreValue(engine.drifting)
  return (
    <Sheet title={props.title} onClose={props.onClose}>
      {props.strength === null ? null : (
        <Fader
          label="how far"
          value={props.strength}
          onInput={props.onStrength}
        />
      )}
      <div className={styles.verbs}>
        <button
          className={styles.chip}
          onClick={() =>
            engine.morphTo(mutate(engine.controls.get(), 0.12, Math.random), 1)
          }
        >
          mutate
        </button>
        <button
          className={drifting ? styles.chipOn : styles.chip}
          aria-pressed={drifting}
          onClick={() =>
            drifting
              ? engine.stopDrift()
              : engine.startDrift(() =>
                  mutate(engine.controls.get(), 0.05, Math.random),
                )
          }
        >
          {drifting ? 'drifting…' : 'drift'}
        </button>
      </div>
    </Sheet>
  )
}

const MIC = CHANNELS.find(c => c.key === 'micLevel')!
const SAMPLER = CHANNELS.find(c => c.key === 'sampleLevel')!

// Every source's level, and the two ways to get outside sound onto the board:
// the room through the mic, and a recording off archive.org on the sampler.
export function MixSheet(props: { onClose: () => void }) {
  const micOn = useStoreValue(engine.micOn)
  const step = useStoreValue(engine.archiveStep)
  const source = useStoreValue(engine.archiveSource)
  const [pool, setPool] = useState(0)
  const [micError, setMicError] = useState('')

  const mic = () => {
    setMicError('')
    if (micOn) {
      engine.disableMic()
      return
    }
    engine
      .enableMic()
      .then(() => {
        if (engine.controls.get().micLevel === 0) engine.set('micLevel', 0.7)
      })
      .catch(() =>
        setMicError(
          'The browser turned the microphone down. Allow it in the site settings and try again.',
        ),
      )
  }

  const roll = () => {
    if (step) {
      engine.cancelRoll()
      return
    }
    void engine.rollSample(POOLS[pool]!)
  }

  return (
    <Sheet title="mix" onClose={props.onClose}>
      <div className={styles.faders}>
        {CHANNELS.filter(c => !c.yours).map(c => (
          <LevelFader key={c.key} k={c.key} label={c.name} />
        ))}
        {micOn ? <LevelFader k={MIC.key} label={MIC.name} /> : null}
        {source === null ? null : (
          <LevelFader k={SAMPLER.key} label={SAMPLER.name} />
        )}
      </div>
      <div className={styles.verbs}>
        <button
          className={micOn ? styles.chipOn : styles.chip}
          aria-pressed={micOn}
          onClick={mic}
        >
          {micOn ? '● mic live' : 'mic'}
        </button>
        <button className={styles.chip} onClick={roll}>
          {step ? '✕ cancel' : '⚄ load a tape'}
        </button>
        <select
          className={styles.pool}
          value={pool}
          aria-label="where the sample comes from"
          onChange={e => setPool(Number(e.target.value))}
        >
          {POOLS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {step ? <p className={styles.note}>{step}</p> : null}
      {!step && source ? (
        <p className={styles.note}>on the sampler: {source.title}</p>
      ) : null}
      {micError === '' ? null : <p className={styles.error}>{micError}</p>}
    </Sheet>
  )
}

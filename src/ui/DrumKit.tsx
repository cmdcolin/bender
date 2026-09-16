import { memo } from 'react'

import { DRUM_VOICES, STEPS, voiceBit, type DrumVoice } from '../drums'
import { engine } from '../engine/engine'
import {
  useControlValue,
  useMeterValue,
  useStoreValue,
} from './ControlsContext'
import { padKeyFor } from './drumKeys'
import styles from './DrumKit.module.css'
import { useCoarse } from './measure'
import { Tip } from './Tip'
import { useStruck } from './useStruck'

const hit = (voice: number) => engine.drumHit(voiceBit(voice))

// DrumKit draws the toy drum machine as a moulded case with eight rubber pads,
// sixteen step lamps and switches that run the pattern and arm recording. A pad
// lights on every hit the kit reports, from the pads, the number keys, the
// pattern or a trigger patch.
//
// The lamps, the pads and the switches render as separate components, so a step
// redraws only the lamps and a hit redraws only the pads that changed.
export function DrumKit() {
  const playing = useStoreValue(engine.drumsPlaying)
  const armed = useStoreValue(engine.drumRecord)

  return (
    <div className={styles.kit} role="group" aria-label="toy drums">
      <div className={styles.deck}>
        <span className={styles.brand}>drums</span>
        <StepLamps playing={playing} />
        <div className={styles.switches}>
          <Tip
            text={
              playing
                ? 'Stops the drum pattern.'
                : 'Runs the drum pattern. Space runs the keyboard tune and the drums together.'
            }
          >
            <button
              className={playing ? styles.playOn : styles.play}
              aria-label={playing ? 'stop pattern' : 'start pattern'}
              aria-pressed={playing}
              onClick={() => engine.setDrumsPlaying(!playing)}
            >
              {playing ? '❚❚' : '▶'}
            </button>
          </Tip>
          <Tip
            text={
              !armed
                ? 'Records hits into the pattern, writing each hit to the nearest step while the pattern runs.'
                : playing
                  ? 'The kit is writing each hit to the nearest step. Press to stop recording.'
                  : 'Recording is armed and the pattern is stopped, so the kit plays hits and writes none of them. Press play to start writing.'
            }
          >
            <button
              className={
                !armed ? styles.rec : playing ? styles.recOn : styles.recIdle
              }
              aria-pressed={armed}
              onClick={() => engine.drumRecord.set(!armed)}
            >
              rec
            </button>
          </Tip>
        </div>
      </div>
      <Pads />
    </div>
  )
}

function StepLamps({ playing }: { playing: boolean }) {
  const level = useControlValue('drumLevel')
  const tick = useMeterValue(m => m.tick)
  const step = playing && level > 0 ? tick % STEPS : -1
  return (
    <span className={styles.lamps} aria-hidden="true">
      {Array.from({ length: STEPS }, (_, s) => (
        <span
          key={s}
          className={
            s === step
              ? styles.lampOn
              : s % 4 === 0
                ? styles.lampBeat
                : styles.lamp
          }
        />
      ))}
    </span>
  )
}

function Pads() {
  const struck = useStruck()
  const coarse = useCoarse()
  return (
    <div className={styles.pads}>
      {DRUM_VOICES.map((voice, i) => (
        <Pad
          key={voice.key}
          voice={voice}
          index={i}
          lit={(struck & voiceBit(i)) !== 0}
          coarse={coarse}
        />
      ))}
    </div>
  )
}

const Pad = memo(function Pad({
  voice,
  index,
  lit,
  coarse,
}: {
  voice: DrumVoice
  index: number
  lit: boolean
  coarse: boolean
}) {
  return (
    <Tip
      text={`Plays the ${voice.label}.${coarse ? '' : ` The ${padKeyFor(index)} key plays it too.`}`}
    >
      <button
        className={lit ? styles.padOn : styles.pad}
        aria-label={`${voice.label} pad`}
        onPointerDown={e => {
          if (e.button === 0) hit(index)
        }}
        onClick={e => {
          if (e.detail === 0) hit(index)
        }}
      >
        {!coarse && <span className={styles.padKey}>{padKeyFor(index)}</span>}
        <span className={styles.padName}>{voice.label}</span>
      </button>
    </Tip>
  )
})

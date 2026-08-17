import { useState, type DragEvent } from 'react'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { ChainMap } from './ChainMap'
import { useStoreValue } from './ControlsContext'
import { GROUPS, STAGE_ORDER } from './controls'
import { Keys } from './Keys'
import { mutate, PRESETS, applyPreset, randomLook } from './presets'
import { Scope } from './Scope'
import { GroupSection, StageHeading } from './Section'
import styles from './App.module.css'

export function App() {
  const running = useStoreValue(engine.running)
  const micOn = useStoreValue(engine.micOn)
  const playing = useStoreValue(engine.playing)
  const sampleName = useStoreValue(engine.sampleName)
  const [dragging, setDragging] = useState(false)

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) await engine.loadSample(file)
  }

  return (
    <div className={styles.app}>
      <div
        className={styles.left}
        onDragOver={e => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Scope />
        <Keys />
        <div className={styles.ioRow}>
          <button
            className={playing ? styles.playBtnOn : styles.playBtn}
            onClick={() => engine.setPlaying(!playing)}
            title="run or stop the chip's ROM tune and the drum pattern"
          >
            {playing ? '❚❚ pause demo song' : '▶ play demo song'}
          </button>
          <button
            className={micOn ? styles.ioBtnOn : styles.ioBtn}
            onClick={() => engine.enableMic()}
          >
            {micOn ? '● mic live' : 'enable mic'}
          </button>
          <span className={dragging ? styles.dropHot : styles.drop}>
            {sampleName
              ? `sample: ${sampleName}`
              : 'drop an audio file anywhere'}
          </span>
        </div>
        <p className={styles.hint}>
          press <b>play demo song</b> or play keys with{' '}
          <span className={styles.kbd}>a s d f …</span> — turn up <b>Starve</b>{' '}
          until the toy reboots, solder the <b>Bend spot</b> pot, push any{' '}
          <b>Feedback</b> past 1
        </p>
      </div>

      <div className={styles.panel}>
        <div className={styles.masthead}>
          <span className={styles.brand}>bender</span>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.btn}
            onClick={() => engine.morphTo(randomLook(Math.random), 1.6)}
          >
            random
          </button>
          <button
            className={styles.btn}
            onClick={e =>
              engine.patch(
                mutate(
                  engine.controls.get(),
                  e.shiftKey ? 0.3 : e.altKey ? 0.04 : 0.12,
                  Math.random,
                ),
              )
            }
            title="mutate the current board — shift for wild, alt for gentle"
          >
            mutate
          </button>
          <button
            className={styles.btn}
            onClick={() => engine.patch({ ...DEFAULT_CONTROLS })}
          >
            reset
          </button>
          <button className={styles.btnDanger} onClick={() => engine.panic()}>
            panic
          </button>
        </div>

        <div className={styles.presets}>
          {PRESETS.map(p => (
            <button
              key={p.name}
              className={styles.preset}
              title={p.blurb}
              onClick={() => engine.morphTo(applyPreset(p))}
            >
              {p.name}
            </button>
          ))}
        </div>

        <ChainMap />

        {STAGE_ORDER.map(stage => (
          <div key={stage} id={`stage-${stage}`}>
            <StageHeading>{stage}</StageHeading>
            {GROUPS.filter(g => g.place === stage).map(g => (
              <GroupSection
                key={g.name}
                group={g}
                defaultOpen={g.name === 'Toy keyboard'}
              />
            ))}
          </div>
        ))}
      </div>

      {!running && (
        <button className={styles.startOverlay} onClick={() => engine.start()}>
          <span className={styles.startBrand}>bender</span>
          <span className={styles.startCta}>▶ power on</span>
          <span className={styles.startWarn}>
            loud, harsh noise ahead — start with your volume low
          </span>
        </button>
      )}
    </div>
  )
}

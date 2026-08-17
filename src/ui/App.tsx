import { useEffect, useState, type DragEvent } from 'react'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { engine } from '../engine/engine'
import { ChainMap } from './ChainMap'
import { useStoreValue } from './ControlsContext'
import { GROUPS, STAGE_ORDER } from './controls'
import { Keys } from './Keys'
import { mutate, PRESETS, applyPreset, randomLook } from './presets'
import { Scope } from './Scope'
import { GroupSection, StageHeading } from './Section'
import styles from './App.module.css'

function clock(seconds: number): string {
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Picking a look is a request to hear it, so the ROM runs even if it was paused.
function audition(target: Controls, seconds?: number) {
  engine.setPlaying(true)
  engine.morphTo(target, seconds)
}

export function App() {
  const running = useStoreValue(engine.running)
  const micOn = useStoreValue(engine.micOn)
  const playing = useStoreValue(engine.playing)
  const recording = useStoreValue(engine.recording)
  const recSeconds = useStoreValue(engine.recSeconds)
  const sampleName = useStoreValue(engine.sampleName)
  const [dragging, setDragging] = useState(false)

  // Space is the transport wherever the focus is; before power-on it is the
  // switch itself, a keypress being gesture enough to open the audio context.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      e.preventDefault()
      if (!engine.running.get()) void engine.start()
      else engine.setPlaying(!engine.playing.get())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
            title="run or stop the chip's ROM tune and the drum pattern — space does it too"
          >
            {playing ? '❚❚ pause demo song' : '▶ play demo song'}
          </button>
          <button
            className={recording ? styles.recBtnOn : styles.ioBtn}
            onClick={() => (recording ? engine.stopRecording() : engine.startRecording())}
            title="record the output to a wav file — stopping saves it"
          >
            {recording ? `■ stop & save ${clock(recSeconds)}` : '● record'}
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
          press <b>play demo song</b> (or <span className={styles.kbd}>space</span>), or play keys
          with <span className={styles.kbd}>a s d f …</span> — turn up <b>Starve</b> until the toy
          reboots, solder the <b>Bend spot</b> pot, push any <b>Feedback</b> past 1
        </p>
      </div>

      <div className={styles.panel}>
        <div className={styles.masthead}>
          <span className={styles.brand}>bender</span>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.btn}
            onClick={() => audition(randomLook(Math.random), 1.6)}
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
              onClick={() => audition(applyPreset(p))}
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

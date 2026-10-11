import { useEffect, useRef, useState } from 'react'

import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { appUrl, siteRoot } from '../site/paths'
import { bendDeal, redealBendKeys } from '../ui/bendKeys'
import { useStoreValue } from '../ui/ControlsContext'
import { read, write } from '../ui/persist'
import { PRESETS, presetPath } from '../ui/presets'
import { randomLook } from '../ui/presets/roll'
import { Scope } from '../ui/Scope'
import { useBoardUrl } from '../ui/useBoardUrl'
import { BendPads } from './BendPads'
import styles from './pocket.module.css'
import { MixSheet, TuneSheet } from './Sheets'
import { SHELVES } from './shelves'
import { BENDS_TAB, Strip, Tabs } from './Strip'
import { TOUCH, touchPush } from './touch'
import { Transport } from './Transport'
import { useGestures } from './useGestures'

import type { Controls } from '../controls'
import type { Glide } from '../engine/glide'

const HINT_STORE = 'bender.pocket.hint'
const MORPH_S = 1

type Panel = 'tune' | 'mix'

// The preset that is up, and the road the board took to it, so the tune sheet
// can stand the board part way along.
interface Up {
  name: string
  from: Controls
  path: Glide
  t: number
}

const share = async (): Promise<string> => {
  const url = location.href
  try {
    if (navigator.share) {
      await navigator.share({ title: 'bender', url })
      return ''
    }
    await navigator.clipboard.writeText(url)
    return 'link copied'
  } catch {
    return ''
  }
}

// Run stops whatever is running. From silence it starts both machines, with
// the kit brought up if the board has it down.
const play = () => {
  if (engine.songPlaying.get() || engine.drumsPlaying.get()) {
    engine.toggleRun()
    return
  }
  void engine.start()
  if (engine.controls.get().drumLevel === 0) {
    engine.armStep()
    engine.set('drumLevel', 0.8)
  }
  engine.runAll()
}

function useFlash() {
  const [flash, setFlash] = useState('')
  const timer = useRef(0)
  const announce = (word: string) => {
    window.clearTimeout(timer.current)
    setFlash(word)
    timer.current = window.setTimeout(() => setFlash(''), 1200)
  }
  return { flash, announce }
}

export function PocketPage() {
  const running = useStoreValue(engine.running)
  const [tab, setTab] = useState(SHELVES[0]!.name)
  const [shelfName, setShelfName] = useState(SHELVES[0]!.name)
  const [up, setUp] = useState<Up | null>(null)
  const [rolled, setRolled] = useState(false)
  const [normal, setNormal] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [help, setHelp] = useState(false)
  const [hintSeen, setHintSeen] = useState(() => read(HINT_STORE) === '1')
  const [bending, setBending] = useState<{ x: number; y: number } | null>(null)
  const { flash, announce } = useFlash()
  const shelf = SHELVES.find(s => s.name === shelfName) ?? SHELVES[0]!

  useEffect(() => engine.autostart(), [])
  useBoardUrl()

  const toggle = (p: Panel) => setPanel(panel === p ? null : p)

  const land = (name: string | null) => {
    setRolled(false)
    if (name === null) {
      setUp(null)
      setNormal(true)
      engine.morphTo({ ...DEFAULT_CONTROLS }, MORPH_S)
      return
    }
    const def = PRESETS.find(p => p.name === name)
    if (!def) return
    const from = engine.controls.get()
    const path = presetPath(def, from)
    engine.morphTo(path.at(from, 1), MORPH_S)
    setNormal(false)
    setUp({ name, from, path, t: 1 })
  }

  // A tap puts a preset up, and a second tap on the one already up opens the
  // sheet that says how far toward it to go.
  const pick = (name: string) => {
    if (up?.name === name) toggle('tune')
    else land(name)
  }

  const roll = () => {
    engine.morphTo(randomLook(engine.controls.get(), Math.random), MORPH_S)
    setUp(null)
    setNormal(false)
    setRolled(true)
  }

  const strengthen = (t: number) => {
    if (up === null) return
    engine.writeBoard(up.path.at(engine.controls.get(), t))
    setUp({ ...up, t })
  }

  // A swipe steps along the shelf, the way a phone camera steps through its
  // filters, with normal at the start.
  const step = (dir: 1 | -1) => {
    const order = [null, ...shelf.presets.map(p => p.name)]
    const at = up === null ? 0 : Math.max(order.indexOf(up.name), 0)
    const name = order[(at + dir + order.length) % order.length] ?? null
    land(name)
    announce(name ?? 'normal')
    document
      .querySelector(`[data-preset="${name ?? 'normal'}"]`)
      ?.scrollIntoView({
        inline: 'center',
        block: 'nearest',
        behavior: 'smooth',
      })
  }

  const gestures = useGestures({
    onSwipe: step,
    onBend: at => {
      if (!hintSeen) {
        setHintSeen(true)
        write(HINT_STORE, '1')
      }
      setBending(at)
      engine.holdThrow(TOUCH, touchPush(at.x, at.y, engine.controls.get()))
    },
    onLift: () => {
      setBending(null)
      engine.letGoThrow(TOUCH)
    },
  })

  const openTab = (name: string) => {
    setTab(name)
    if (name === BENDS_TAB) {
      if (bendDeal.get().length === 0) redealBendKeys(engine.controls.get())
    } else setShelfName(name)
  }

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <a className={styles.brand} href={siteRoot} aria-label="bender home">
          <img className={styles.mark} src={`${siteRoot}favicon.svg`} alt="" />
          <span>bender</span>
        </a>
        <span className={styles.topRight}>
          <button
            className={styles.round}
            aria-label="share a link to this board"
            onClick={() => void share().then(w => w && announce(w))}
          >
            ↗
          </button>
          <button
            className={styles.round}
            aria-label="how to play"
            aria-pressed={help}
            onClick={() => setHelp(!help)}
          >
            ?
          </button>
          <a
            className={styles.full}
            href={appUrl}
            title="open the whole instrument on this board"
            onClick={e => {
              e.currentTarget.href = `${appUrl}${location.hash}`
            }}
          >
            full app ↗
          </a>
        </span>
      </header>

      <main className={styles.stage}>
        <div
          className={styles.glass}
          onPointerDown={gestures.press}
          onPointerMove={gestures.drag}
          onPointerUp={gestures.release}
          onPointerCancel={gestures.release}
          onContextMenu={e => e.preventDefault()}
        >
          <Scope className={styles.scope} />
          {bending === null ? null : (
            <span
              className={styles.touch}
              style={{
                left: `${bending.x * 100}%`,
                top: `${(1 - bending.y) * 100}%`,
              }}
            />
          )}
        </div>
        <div className={styles.switches}>
          <button
            className={panel === 'tune' ? styles.switchOn : styles.switch}
            aria-pressed={panel === 'tune'}
            onClick={() => toggle('tune')}
          >
            <span className={styles.switchIcon}>≋</span>
            tune
          </button>
          <button
            className={panel === 'mix' ? styles.switchOn : styles.switch}
            aria-pressed={panel === 'mix'}
            onClick={() => toggle('mix')}
          >
            <span className={styles.switchIcon}>☷</span>
            mix
          </button>
        </div>
        {flash === '' ? null : <span className={styles.flash}>{flash}</span>}
        {!running ? (
          <span className={styles.notice}>
            tap anywhere to power on. It gets loud, so start with the volume
            low.
          </span>
        ) : !hintSeen && !help ? (
          <span className={styles.hint}>
            swipe for presets · hold and drag to bend
          </span>
        ) : null}
        {help ? (
          <div className={styles.help} onClick={() => setHelp(false)}>
            <ul>
              <li>▶ runs the toy&apos;s tune and the drum machine</li>
              <li>swipe the scope sideways for the next preset</li>
              <li>
                hold the scope and drag: across sweeps a filter, up feeds the
                delay back on itself
              </li>
              <li>
                tap a preset twice to set how far toward it the board goes
              </li>
              <li>
                <b>bends</b> holds sixteen dealt bends: tap one on, tap again to
                let go
              </li>
              <li>
                <b>mix</b> sets each machine&apos;s level and brings in the mic
                or a sample
              </li>
              <li>● rec saves a wav of what you hear</li>
            </ul>
          </div>
        ) : null}
      </main>

      <section className={styles.controls}>
        <Tabs shelves={SHELVES} tab={tab} onTab={openTab} />
        {tab === BENDS_TAB ? (
          <BendPads />
        ) : (
          <Strip
            shelf={shelf}
            up={up?.name ?? null}
            rolled={rolled}
            normal={normal}
            strength={up?.t ?? 1}
            onRoll={roll}
            onNormal={() => land(null)}
            onPick={pick}
          />
        )}
        <Transport onPlay={play} />
        {panel === 'tune' ? (
          <TuneSheet
            title={up?.name ?? (rolled ? 'random' : 'this board')}
            strength={up?.t ?? null}
            onStrength={strengthen}
            onClose={() => setPanel(null)}
          />
        ) : null}
        {panel === 'mix' ? <MixSheet onClose={() => setPanel(null)} /> : null}
      </section>
    </div>
  )
}

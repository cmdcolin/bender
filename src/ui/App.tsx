import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { STEPS } from '../drums.ts'
import { engine } from '../engine/engine.ts'
import { PHRASE_LOCKS } from '../engine/phraseClock.ts'
import { pocketUrl } from '../site/paths.ts'
import { versionLabel } from '../version.ts'
import { AboutDialog } from './AboutDialog.tsx'
import { Account } from './Account.tsx'
import styles from './App.module.css'
import { BodyPad } from './BodyPad.tsx'
import { ChainMap } from './ChainMap.tsx'
import { GROUPS } from './controls/index.ts'
import { useStoreValue } from './ControlsContext.ts'
import { Dice } from './Dice.tsx'
import { useDrumKeys } from './drumKeys.ts'
import { add, clearAdded, confine, confineToOne } from './fitted.ts'
import { HuntDialog } from './HuntDialog.tsx'
import { Instruments } from './Instruments.tsx'
import { isTyping } from './isTyping.ts'
import { remapOpen } from './keymap.ts'
import { KeysDialog } from './KeysDialog.tsx'
import { listView } from './listView.ts'
import { useCoarse } from './measure.ts'
import { Menu } from './Menu.tsx'
import { menuItem } from './menuItems.ts'
import { MidiMenuItem, MidiPanel } from './MidiPanel.tsx'
import {
  MORPH_LABELS,
  MORPH_SECONDS,
  loadPhraseLock,
  morphSetting,
  PHRASE_LOCK_LABELS,
  setMorph,
  setPhraseLock,
  type MorphSeconds,
} from './morph.ts'
import { PinnedStrip } from './PinnedStrip.tsx'
import { Presets } from './PresetRow.tsx'
import { mutate, presetNameFor } from './presets/index.ts'
import { Recorder } from './Recorder.tsx'
import { SavedVoices } from './SavedVoices.tsx'
import { Scope } from './Scope.tsx'
import { OpenGroup } from './Section.tsx'
import { boardFrom, boardFromUrl, boardHash } from './share.ts'
import { ShareButton } from './ShareButton.tsx'
import { PathHint } from './Shelf.tsx'
import { StageList } from './StageList.tsx'
import { StartOverlay } from './StartOverlay.tsx'
import { dragging } from './tapeDrop.ts'
import { Tip } from './Tip.tsx'
import { useBoardUrl } from './useBoardUrl.ts'
import { useCurrentSession } from './useCurrentSession.ts'
import { useSavedVoices, type VoiceFlash } from './useSavedVoices.ts'
import { useSyncedPrefs } from './useSyncedPrefs.ts'
import { suggestVoiceName, type SavedVoice } from './voiceModel.ts'
import { WhySignInDialog } from './WhySignInDialog.tsx'

const MUTATE_HELP =
  'Keeps this board and nudges the controls of the stages on it a little way off where they sit. The tempo stays put and the timed things land back on the grid — shift for a wild nudge, alt for a gentle one.'

const DRIFT_HELP =
  'Lets the stages on the board nudge themselves somewhere near where they stand, one stage at a time, every fifteen seconds or every run of the land lock, forever. None of it lands in the walk, so one undo puts back the board you set drifting.'

const nudged = (amount: number) => {
  const current = engine.controls.get()
  return confine(mutate(current, amount, Math.random), current, Math.random)
}

const SAVE_HELP =
  'Keeps the board on screen as a voice, under the name the saved menu is offering. ctrl+S does the same. Saving again under that name overwrites that voice.'

const SAVE_SIGNED_OUT_HELP =
  'Keeps the board on screen under a name, on your account. Press it to read what an account is for; the board you are looking at is saved as soon as you sign in.'

function MorphControl(props: {
  seconds: MorphSeconds
  drifting: boolean
  onSet: (s: MorphSeconds) => void
}) {
  const progress = useSyncExternalStore(
    engine.morphProgress.subscribe,
    engine.morphProgress.get,
  )
  const waiting = useStoreValue(engine.waiting)
  if (waiting !== null && !props.drifting)
    return <Waiting tick={waiting.tick} />
  if (progress !== null && !props.drifting) {
    return (
      <Tip
        text={`Travelling over ${props.seconds}s. Press to stop here and keep the half-way board — grabbing a slider does the same.`}
      >
        <button className={styles.flight} onClick={() => engine.stopMorph()}>
          <span
            className={styles.flightFill}
            style={{ transform: `scaleX(${progress})` }}
          />
          <span className={styles.flightLabel}>stop here</span>
        </button>
      </Tip>
    )
  }
  return (
    <Tip
      text={
        props.seconds > 0
          ? `Presets, random, mutate and reset travel to the new board over ${props.seconds}s instead of cutting to it.`
          : 'Presets, random, mutate and reset land in one frame. Pick a duration and they travel there instead — which is where the sounds between two presets live.'
      }
    >
      <select
        className={styles.morph}
        value={props.seconds}
        onChange={e => {
          const picked = MORPH_SECONDS.find(s => String(s) === e.target.value)
          if (picked !== undefined) props.onSet(picked)
        }}
      >
        {MORPH_SECONDS.map(s => (
          <option key={s} value={s}>{`morph: ${MORPH_LABELS[s]}`}</option>
        ))}
      </select>
    </Tip>
  )
}

// A change held for the downbeat, counting down the bars to it.
function Waiting({ tick }: { tick: number }) {
  const bars = useSyncExternalStore(engine.meter.subscribe, () =>
    Math.max(Math.ceil((tick - engine.meter.get().tick) / STEPS), 1),
  )
  return (
    <Tip text="The change lands on the downbeat the lock is waiting for. Press to call it off and keep the board as it stands.">
      <button className={styles.flight} onClick={() => engine.stopMorph()}>
        <span className={styles.flightLabel}>
          {bars === 1 ? 'on the one' : `in ${bars} bars`}
        </span>
      </button>
    </Tip>
  )
}

function PhraseLockControl() {
  const bars = useStoreValue(engine.phraseLock)
  return (
    <Tip
      text={
        bars === 0
          ? 'Presets, random, mutate, reset, cuts and drift set off at once. Pick a run of bars and, while the kit runs, they wait to land on its next downbeat.'
          : `While the kit runs, presets, random, mutate, reset, cuts and drift wait to land on the next downbeat of ${bars === 1 ? 'a bar' : `${bars} bars`}; a morph sets off early so it arrives there.`
      }
    >
      <select
        className={styles.morph}
        value={bars}
        onChange={e => {
          const picked = PHRASE_LOCKS.find(b => String(b) === e.target.value)
          if (picked !== undefined) setPhraseLock(picked)
        }}
      >
        {PHRASE_LOCKS.map(b => (
          <option key={b} value={b}>{`land: ${PHRASE_LOCK_LABELS[b]}`}</option>
        ))}
      </select>
    </Tip>
  )
}

function SteadyLabel({
  widest,
  children,
}: {
  widest: string
  children: string
}) {
  return (
    <span className={styles.holdsWidest}>
      {children !== widest && (
        <span className={styles.widest} aria-hidden>
          {widest}
        </span>
      )}
      <span>{children}</span>
    </span>
  )
}

function AppMenu({
  signedIn,
  coarse,
  onWhy,
  onMidi,
}: {
  signedIn: boolean
  coarse: boolean
  onWhy: () => void
  onMidi: () => void
}) {
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const pick = (then: () => void) => () => {
    setOpen(false)
    then()
  }
  return (
    <>
      <Tip text="The simple version, computer keys and the rest of the settings.">
        <button
          ref={setButton}
          className={styles.menuBtn}
          aria-label="menu"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          ☰
        </button>
      </Tip>
      {open && (
        <Menu
          anchor={button}
          toggle={button}
          role="menu"
          onClose={() => setOpen(false)}
        >
          {signedIn || (
            <button
              role="menuitem"
              className={menuItem(false)}
              onClick={pick(onWhy)}
            >
              why sign in?
            </button>
          )}
          <button
            role="menuitem"
            className={menuItem(false)}
            onClick={() => {
              window.location.href = `${pocketUrl}${window.location.hash}`
            }}
          >
            simple version
          </button>
          {coarse || (
            <button
              role="menuitem"
              className={menuItem(false)}
              onClick={pick(() => remapOpen.set(true))}
            >
              computer keys
            </button>
          )}
          <MidiMenuItem className={menuItem(false)} onPick={pick(onMidi)} />
        </Menu>
      )}
    </>
  )
}

function BoardVerbs({
  seconds,
  drifting,
  saveFlash,
  signedIn,
  onLanded,
  onSave,
}: {
  seconds: MorphSeconds
  drifting: boolean
  saveFlash: VoiceFlash['kind'] | undefined
  signedIn: boolean
  onLanded: (landed: boolean) => void
  onSave: () => void
}) {
  const walk = useStoreValue(engine.history)
  return (
    <div className={styles.actions}>
      <Dice seconds={seconds} onLanded={onLanded} />
      <Tip text={MUTATE_HELP}>
        <button
          className={styles.btn}
          onClick={e =>
            engine.morphTo(
              nudged(e.shiftKey ? 0.3 : e.altKey ? 0.04 : 0.12),
              seconds,
            )
          }
        >
          mutate
        </button>
      </Tip>
      <Tip
        text={
          drifting
            ? 'stop drifting and keep the board wherever it has got to'
            : DRIFT_HELP
        }
      >
        <button
          className={drifting ? styles.btnOn : styles.btn}
          onClick={() =>
            drifting
              ? engine.stopDrift()
              : engine.startDrift(() => {
                  const current = engine.controls.get()
                  return confineToOne(
                    mutate(current, 0.1, Math.random),
                    current,
                    Math.random,
                  )
                })
          }
        >
          <SteadyLabel widest="drifting…">
            {drifting ? 'drifting…' : 'drift'}
          </SteadyLabel>
        </button>
      </Tip>
      {drifting && (
        <Tip text="Stop drifting and go back to where it was ten seconds ago.">
          <button
            className={styles.btn}
            onClick={() => engine.driftBack(10, seconds)}
          >
            ⟲ 10s
          </button>
        </Tip>
      )}
      <Tip text="Back to the board the toy ships with, and every stage you added off the map. It lands in the walk, so undo brings back the controls you were on.">
        <button
          className={styles.btnQuiet}
          onClick={() => {
            clearAdded()
            engine.morphTo({ ...DEFAULT_CONTROLS }, seconds)
          }}
        >
          reset
        </button>
      </Tip>
      <Tip text={signedIn ? SAVE_HELP : SAVE_SIGNED_OUT_HELP}>
        <button
          className={saveFlash === 'failed' ? styles.btnBad : styles.btn}
          onClick={onSave}
        >
          <SteadyLabel widest="saved ✓">
            {saveFlash === 'saved'
              ? 'saved ✓'
              : saveFlash === 'failed'
                ? 'save ✕'
                : 'save'}
          </SteadyLabel>
        </button>
      </Tip>
      <Tip text="Steps back through the boards you have been through (ctrl+z).">
        <button
          className={walk.past.length ? styles.btn : styles.btnOff}
          onClick={() => engine.undo(seconds)}
          disabled={!walk.past.length}
        >
          undo
        </button>
      </Tip>
      {walk.future.length > 0 && (
        <Tip text="Steps forward again (ctrl+shift+z).">
          <button className={styles.btn} onClick={() => engine.redo(seconds)}>
            redo
          </button>
        </Tip>
      )}
    </div>
  )
}

const boardQuery = () => boardHash(window.location.hash, engine.controls.get())

const copyLink = (query: string) => {
  const { origin, pathname } = window.location
  return navigator.clipboard
    .writeText(`${origin}${pathname}#${query}`)
    .then(() => true)
    .catch(() => false)
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  dragging.set(false)
  const file = e.dataTransfer.files[0]
  if (file) await engine.loadSample(file)
}

export function App(props: { openedFromLink?: boolean }) {
  const running = useStoreValue(engine.running)
  const fault = useStoreValue(engine.fault)
  const sampleError = useStoreValue(engine.sampleError)
  const remapping = useStoreValue(remapOpen)
  const coarse = useCoarse()
  const [open, setOpen] = useState<string | null>(null)
  const openGroup = GROUPS.find(g => g.name === open)
  const show = (name: string | null) => {
    if (name) add([name])
    setOpen(name)
  }
  const toggle = (name: string) => show(open === name ? null : name)
  const listed = useStoreValue(listView)
  const morphSeconds = useStoreValue(morphSetting)
  useEffect(loadPhraseLock, [])
  const drifting = useStoreValue(engine.drifting)
  const [landed, setLanded] = useState(false)
  const dismissLanded = useCallback(() => setLanded(false), [])
  const [showStart, setShowStart] = useState(!!props.openedFromLink)
  const [showAbout, setShowAbout] = useState(false)
  const [why, setWhy] = useState<{ pending: string | null } | null>(null)
  const [showMidi, setShowMidi] = useState(false)

  const lib = useSavedVoices()
  const libUid = lib.user?.uid ?? null
  const signedIn = lib.status === 'ready'

  const suggestName = () =>
    suggestVoiceName(
      lib.voices,
      lib.lastName ?? presetNameFor(engine.controls.get()) ?? 'my voice',
    )

  const morphToQuery = (query: string) => {
    const patch = boardFromUrl('', `#${query}`)
    if (patch !== null)
      engine.morphTo(boardFrom(patch, engine.controls.get()), morphSeconds)
  }
  const recall = (voice: SavedVoice) => {
    morphToQuery(voice.query)
    lib.markRecalled(voice.name)
  }
  const openVoice = (voice: SavedVoice) => {
    window.location.hash = voice.query
    lib.markRecalled(voice.name)
  }

  useEffect(() => engine.autostart(), [])
  useBoardUrl()
  useCurrentSession(libUid)
  useSyncedPrefs(libUid)
  useDrumKeys()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey)
        return
      if (e.defaultPrevented || isTyping(e.target)) return
      e.preventDefault()
      engine.toggleRun()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const askSave = () => {
    const name = suggestName()
    if (lib.saveVoice(name, boardQuery()) === 'needs-auth')
      setWhy({ pending: name })
  }

  const save = useRef(() => {})
  // oxlint-disable-next-line react/refs -- the keydown listener reads the latest save handler through this ref
  save.current = askSave

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== 's' ||
        !(e.ctrlKey || e.metaKey) ||
        e.shiftKey ||
        isTyping(e.target)
      )
        return
      e.preventDefault()
      save.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey)) return
      if (isTyping(e.target)) return
      e.preventDefault()
      if (e.shiftKey) engine.redo(morphSeconds)
      else engine.undo(morphSeconds)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [morphSeconds])

  return (
    <div
      className={styles.app}
      onDragOver={e => {
        e.preventDefault()
        dragging.set(true)
      }}
      onDragLeave={e => {
        if (
          !e.currentTarget.contains(
            e.relatedTarget instanceof Node ? e.relatedTarget : null,
          )
        )
          dragging.set(false)
      }}
      onDrop={onDrop}
    >
      <main className={styles.left}>
        <div className={styles.top}>
          <div className={styles.scope}>
            <Scope />
            {fault !== '' ? (
              <p className={styles.hint} role="alert">
                <b className={styles.warn}>{fault}</b>
              </p>
            ) : !running ? (
              <p className={styles.hint}>
                <b className={styles.warn}>
                  click anywhere to power on — loud, harsh noise ahead, start
                  with your volume low.
                </b>
              </p>
            ) : sampleError !== '' ? (
              <p className={styles.hint} role="alert">
                <b className={styles.warn}>{sampleError}</b>
              </p>
            ) : null}
          </div>
          <Recorder />
        </div>
        <PinnedStrip />
        <Instruments seconds={morphSeconds} onOpen={show} />
        <BodyPad onOpen={show} />
      </main>

      <aside className={styles.panel} aria-label="the board">
        <div className={styles.chrome}>
          <div className={styles.head}>
            <Tip text="What this is, where the docs and the source are, and which build you are on.">
              <button
                className={styles.nameplate}
                onClick={() => setShowAbout(true)}
              >
                <span className={styles.brand}>bender</span>
                <span className={styles.version}>{versionLabel}</span>
              </button>
            </Tip>
            <MorphControl
              seconds={morphSeconds}
              drifting={drifting}
              onSet={setMorph}
            />
            <PhraseLockControl />
            <MidiPanel
              open={showMidi}
              onToggle={() => setShowMidi(o => !o)}
              onClose={() => setShowMidi(false)}
            />
            <ShareButton onCopy={() => copyLink(boardQuery())} />
            <SavedVoices
              voices={lib.voices}
              recent={lib.recent}
              onRecallSession={s => morphToQuery(s.query)}
              onOpenSession={s => {
                window.location.hash = s.query
              }}
              suggestName={suggestName}
              onSave={name => lib.saveVoice(name, boardQuery())}
              onRecall={recall}
              onOpen={openVoice}
              onDelete={lib.deleteVoice}
              onCopyLink={voice => copyLink(voice.query)}
              flash={lib.flash}
              status={lib.status}
              error={lib.error}
            />
            <Account
              user={lib.user}
              status={lib.status}
              onSignIn={lib.signIn}
              onSignOut={lib.signOut}
            />
            <AppMenu
              signedIn={signedIn}
              coarse={coarse}
              onWhy={() => setWhy({ pending: null })}
              onMidi={() => setShowMidi(true)}
            />
          </div>

          <BoardVerbs
            seconds={morphSeconds}
            drifting={drifting}
            saveFlash={lib.flash?.kind}
            signedIn={signedIn}
            onLanded={setLanded}
            onSave={askSave}
          />
        </div>

        <HuntDialog landed={landed} onDismiss={dismissLanded} />

        {showStart && <StartOverlay onClose={() => setShowStart(false)} />}

        {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}

        {remapping && <KeysDialog onClose={() => remapOpen.set(false)} />}

        {why && (
          <WhySignInDialog
            pendingName={why.pending}
            onClose={() => {
              setWhy(null)
              lib.dropPending()
            }}
            onSignIn={() => {
              setWhy(null)
              lib.signIn()
            }}
            onCopyLink={() => copyLink(boardQuery())}
          />
        )}

        <Presets morphSeconds={morphSeconds} folded />
        {listed ? (
          <StageList seconds={morphSeconds} />
        ) : (
          <>
            <ChainMap open={open} onOpen={toggle} seconds={morphSeconds} />
            {openGroup ? (
              <OpenGroup
                group={openGroup}
                onClose={() => setOpen(null)}
                seconds={morphSeconds}
              />
            ) : (
              <PathHint />
            )}
          </>
        )}
      </aside>
    </div>
  )
}

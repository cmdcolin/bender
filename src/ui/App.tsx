import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
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
import { add, clearAdded, confine } from './fitted.ts'
import { HuntDialog } from './HuntDialog.tsx'
import { Instruments } from './Instruments.tsx'
import { isTyping } from './isTyping.ts'
import { remapOpen } from './keymap.ts'
import { KeysDialog } from './KeysDialog.tsx'
import { useCoarse } from './measure.ts'
import { Menu } from './Menu.tsx'
import { menuItem } from './menuItems.ts'
import { MidiMenuItem, MidiPanel } from './MidiPanel.tsx'
import {
  MORPH_LABELS,
  MORPH_SECONDS,
  morphSetting,
  setMorph,
  type MorphSeconds,
} from './morph.ts'
import { PinnedStrip } from './PinnedStrip.tsx'
import { Presets } from './PresetRow.tsx'
import { mutate, presetNameFor } from './presets/index.ts'
import { Recorder } from './Recorder.tsx'
import { SavedVoices } from './SavedVoices.tsx'
import { Scope } from './Scope.tsx'
import { OpenGroup, PathHint } from './Section.tsx'
import { boardFrom, boardFromUrl, boardHash } from './share.ts'
import { ShareButton } from './ShareButton.tsx'
import { StartOverlay } from './StartOverlay.tsx'
import { dragging } from './tapeDrop.ts'
import { Tip } from './Tip.tsx'
import { useBoardUrl } from './useBoardUrl.ts'
import { useCurrentSession } from './useCurrentSession.ts'
import { useSavedVoices } from './useSavedVoices.ts'
import { useSyncedPrefs } from './useSyncedPrefs.ts'
import { suggestVoiceName, type SavedVoice } from './voiceModel.ts'
import { WhySignInDialog } from './WhySignInDialog.tsx'

// One slot holding either the duration a new board *will* take to arrive or,
// while one travels, how far along it is and the way to stop it. They are one
// widget read two ways, and the actions row has no sixth place to give.
//
// The flight readout earns its place because a long morph is otherwise
// indistinguishable from an app that ignored you: at 30s the first second moves
// almost nothing. Pressing it says "I liked it better half way", which until now
// you could only say by grabbing a slider — that is, by changing the board you
// wanted to keep.
//
// The only thing here that subscribes to the morph, deliberately: progress moves
// every frame, and held in App it would re-render the whole panel at that rate.
//
// A drift travels too, and this stays the duration picker through it: the leg
// is the drift's own length rather than the one this names, stopping it here
// keeps the board for fifteen seconds and no longer, and the picker is the only
// place the next roll's duration is set — so a drift must not take it away for
// as long as it runs. Drift's own button is what stops a drift.
const MUTATE_HELP =
  'Keeps this board and nudges the controls of the stages on it a little way off where they sit. The tempo stays put and the timed things land back on the grid — shift for a wild nudge, alt for a gentle one.'

// Beside mutate, because that is what it is: the same nudge, gentle, on a
// timer, forever. Nothing else on the board plays itself.
const DRIFT_HELP =
  'Lets the stages on the board nudge themselves somewhere near where they stand, every fifteen seconds, forever. None of it lands in the walk, so one undo puts back the board you set drifting.'

const nudged = (amount: number) => {
  const current = engine.controls.get()
  return confine(mutate(current, amount, Math.random), current, Math.random)
}

// Save sits in the row of verbs, among the other things you do to the board on
// screen. Beside the nameplate, `saved` holds the list and the avatar holds the
// account.
const SAVE_HELP =
  'Keeps the board on screen as a voice, under the name the saved menu is offering. ctrl+S does the same. Saving again under that name overwrites that voice.'

// The same button with nobody signed in. It stays live, and a press opens the
// card that says what an account is for.
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

// The board as the address bar spells it, which is what a voice holds.
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
  const remapping = useStoreValue(remapOpen)
  const coarse = useCoarse()
  // Which stage's controls the panel is showing. The map is the way in — every
  // group has a door on it, the stages along the path and the rest of the board
  // drawn where it sits — so one stage is open at a time and the rest of the
  // panel stays the map.
  const [open, setOpen] = useState<string | null>(null)
  const openGroup = GROUPS.find(g => g.name === open)
  // Opening a stage puts it on the map, so closing it again leaves it there.
  const show = (name: string | null) => {
    if (name) add([name])
    setOpen(name)
  }
  const toggle = (name: string) => show(open === name ? null : name)
  const morphSeconds = useStoreValue(morphSetting)
  const walk = useStoreValue(engine.history)
  const drifting = useStoreValue(engine.drifting)
  // Whether the last hunt reached the end and kept a board, as against being
  // called off, which is what the dialog stays up to say. A hunt that was
  // stopped by hand needs no note: you are holding the answer.
  const [landed, setLanded] = useState(false)
  const dismissLanded = useCallback(() => setLanded(false), [])
  // Up once, for a board that arrived from a link: closing it, by either
  // door, is the last anyone hears of it — pressing play from the row below
  // afterwards is a second gesture and gets no overlay to answer to.
  const [showStart, setShowStart] = useState(!!props.openedFromLink)
  const [showAbout, setShowAbout] = useState(false)
  // Why an account, and the name of the save waiting on the answer. `null` is
  // shut, and `{ pending: null }` is the card opened from the menu with no save
  // behind it.
  const [why, setWhy] = useState<{ pending: string | null } | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showMidi, setShowMidi] = useState(false)
  const [menuBtn, setMenuBtn] = useState<HTMLButtonElement | null>(null)

  const lib = useSavedVoices()
  const libUid = lib.user?.uid ?? null
  const signedIn = lib.status === 'ready'

  // What the name box offers: the preset the board is standing on, or the voice
  // last saved or recalled, counted up once that name is taken.
  const suggestName = () =>
    suggestVoiceName(
      lib.voices,
      lib.lastName ?? presetNameFor(engine.controls.get()) ?? 'my voice',
    )

  // Recall morphs, the way pressing a preset chip does. An open lands the whole
  // board at once by putting it on the address bar — useBoardUrl hears the
  // hashchange and applies it, which is exactly what arriving on a link does.
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

  // Space is the run/stop line over both machines, wherever the focus is; the
  // keypress itself is the gesture that takes the audio context live.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey)
        return
      // A select included: space is the only way a keyboard opens one, and the
      // panel picks a morph duration, a row length and half its choices that
      // way. A focused button is not — space over one is still the run line,
      // which is the point of running it over the whole window.
      if (isTyping(e.target)) return
      e.preventDefault()
      engine.toggleRun()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A save with nobody signed in opens the why-sign-in card. useSavedVoices
  // holds the board, so signing in from the card saves what was on screen when
  // the key went down.
  const askSave = () => {
    const name = suggestName()
    if (lib.saveVoice(name, boardQuery()) === 'needs-auth')
      setWhy({ pending: name })
  }

  // Read at keypress time rather than closed over when the listener went on,
  // so the handler goes on the window once and still saves the board and the
  // library as they are now.
  const save = useRef(() => {})
  // oxlint-disable-next-line react/refs -- the keydown listener reads the latest save handler through this ref
  save.current = askSave

  // Save, on the key every application that saves anything puts it on. The
  // board is not a document and the browser's own dialog would offer to write
  // the page to disk, so the default goes either way.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== 's' ||
        !(e.ctrlKey || e.metaKey) ||
        e.shiftKey
      )
        return
      e.preventDefault()
      save.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The walk, on the keys every other app puts it on. Repeats count: holding
  // ctrl+z is how you get back out of a run of rolls.
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
    // The whole window takes the drop, because the hint says anywhere and a
    // dragover nobody cancels is a drop the browser takes itself — which on the
    // panel, half the width of the app, meant navigating away from the board.
    // Dragleave fires on the way into a child as well, so the flag only clears
    // for a pointer that has left the app entirely.
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
        {/* Wrapped so the narrow layout can send it to the end: a trace with
            nothing on it is the first screen of a phone otherwise. */}
        <div className={styles.scope}>
          <Scope />
          {!running && (
            <p className={styles.hint}>
              <b className={styles.warn}>
                click anywhere to power on — loud, harsh noise ahead, start with
                your volume low.
              </b>
            </p>
          )}
        </div>
        <PinnedStrip />
        <Instruments seconds={morphSeconds} onOpen={show} />
        <BodyPad onOpen={show} />
        <div className={styles.studio}>
          <Recorder />
        </div>
      </main>

      <aside className={styles.panel} aria-label="the board">
        {/* Pinned to the top of the panel while the rest of it scrolls: panic
            and undo are the two ways out of a board gone wrong, and both used
            to leave the screen the moment a stage was opened under the map. */}
        <div className={styles.chrome}>
          {/* The nameplate, and beside it how a board arrives and how to stop one
            that has arrived badly. Neither of those picks a board, so they stay
            out of the rows that do — and a duration picker is not worth a line
            of the panel's height on its own. */}
          <div className={styles.head}>
            {/* The nameplate is the way in to what this is: a link to the source
              and the docs has nowhere else to live on a panel made of stages,
              and the build it names is the first thing a bug report is asked
              for. */}
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
            {/* About the board as a whole rather than any one stage of it. */}
            <MidiPanel
              open={showMidi}
              onToggle={() => setShowMidi(o => !o)}
              onClose={() => setShowMidi(false)}
            />
            <ShareButton onCopy={() => copyLink(boardQuery())} />
            {/* Beside the MIDI drawer for the same reason it is: a fact about
              the session rather than a verb over the board. */}
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
            {/* The account, beside the library. The two shared one button,
                whose label alternated between `saved` and `sign in`. */}
            <Account
              user={lib.user}
              status={lib.status}
              onSignIn={lib.signIn}
              onSignOut={lib.signOut}
            />
            <Tip text="About this build, and where the docs and source are.">
              <button
                ref={setMenuBtn}
                className={styles.menuBtn}
                aria-label="menu"
                aria-expanded={showMenu}
                onClick={() => setShowMenu(o => !o)}
              >
                ☰
              </button>
            </Tip>
            {showMenu && (
              <Menu
                anchor={menuBtn}
                toggle={menuBtn}
                role="menu"
                onClose={() => setShowMenu(false)}
              >
                {/* Only with nobody signed in; a signed-in reader has the
                    answer already. */}
                {signedIn || (
                  <button
                    role="menuitem"
                    className={menuItem(false)}
                    onClick={() => {
                      setShowMenu(false)
                      setWhy({ pending: null })
                    }}
                  >
                    why sign in?
                  </button>
                )}
                <button
                  role="menuitem"
                  className={menuItem(false)}
                  onClick={() => {
                    setShowMenu(false)
                    setShowAbout(true)
                  }}
                >
                  about
                </button>
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
                    onClick={() => {
                      setShowMenu(false)
                      remapOpen.set(true)
                    }}
                  >
                    computer keys
                  </button>
                )}
                <MidiMenuItem
                  className={menuItem(false)}
                  onPick={() => {
                    setShowMenu(false)
                    setShowMidi(true)
                  }}
                />
              </Menu>
            )}
          </div>

          <div className={styles.actions}>
            <Dice seconds={morphSeconds} onLanded={setLanded} />
            <Tip text={MUTATE_HELP}>
              <button
                className={styles.btn}
                onClick={e =>
                  engine.morphTo(
                    nudged(e.shiftKey ? 0.3 : e.altKey ? 0.04 : 0.12),
                    morphSeconds,
                  )
                }
              >
                mutate
              </button>
            </Tip>
            {/* Beside mutate, because that is what it is: the same nudge, gentle,
              on a timer, forever. Nothing else on the board plays itself. */}
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
                    : engine.startDrift(() => nudged(0.05))
                }
              >
                <span className={styles.holdsWidest}>
                  {drifting || (
                    <span className={styles.widest} aria-hidden>
                      drifting…
                    </span>
                  )}
                  <span>{drifting ? 'drifting…' : 'drift'}</span>
                </span>
              </button>
            </Tip>
            {drifting && (
              <Tip text="Stop drifting and go back to where it was ten seconds ago.">
                <button
                  className={styles.btn}
                  onClick={() => engine.driftBack(10, morphSeconds)}
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
                  engine.morphTo({ ...DEFAULT_CONTROLS }, morphSeconds)
                }}
              >
                reset
              </button>
            </Tip>
            {/* Between the verbs that change the board and the two that step
              back through it. The label holds the width of its own ✓, so the
              row keeps still as a save lands. */}
            <Tip text={signedIn ? SAVE_HELP : SAVE_SIGNED_OUT_HELP}>
              <button
                className={
                  lib.flash?.kind === 'failed' ? styles.btnBad : styles.btn
                }
                onClick={askSave}
              >
                <span className={styles.holdsWidest}>
                  <span className={styles.widest} aria-hidden>
                    saved ✓
                  </span>
                  <span>
                    {lib.flash?.kind === 'saved'
                      ? 'saved ✓'
                      : lib.flash?.kind === 'failed'
                        ? 'save ✕'
                        : 'save'}
                  </span>
                </span>
              </button>
            </Tip>
            {/* Beside reset, because what undo has in common with it is what a
              hand reaching for either one wants: out of here. */}
            <Tip text="Steps back through the boards you have been through (ctrl+z).">
              <button
                className={walk.past.length ? styles.btn : styles.btnOff}
                onClick={() => engine.undo(morphSeconds)}
                disabled={!walk.past.length}
              >
                undo
              </button>
            </Tip>
            {/* Only once there is a walk to step forward into: a permanently
              greyed redo would cost a slot in the row on every session that
              never undid anything. */}
            {walk.future.length > 0 && (
              <Tip text="Steps forward again (ctrl+shift+z).">
                <button
                  className={styles.btn}
                  onClick={() => engine.redo(morphSeconds)}
                >
                  redo
                </button>
              </Tip>
            )}
          </div>
        </div>

        {/* What the hunt is doing while it does it, and the only way to call
            it off: eight seconds of the board playing six strangers reads as a
            fault unless something says otherwise. */}
        <HuntDialog landed={landed} onDismiss={dismissLanded} />

        {/* A link opens a board nobody has heard yet, with the two run
            buttons buried in the row below — this is what says where to
            press and starts both machines together, eased up rather than
            landing at whatever level the board was left. */}
        {showStart && <StartOverlay onClose={() => setShowStart(false)} />}

        {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}

        {remapping && <KeysDialog onClose={() => remapOpen.set(false)} />}

        {/* Closing on the way to the popup leaves the Google window clear.
            The save the card was holding lands on the save button below. */}
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
      </aside>
    </div>
  )
}

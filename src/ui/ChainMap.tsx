import {
  createElement,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'

import { engine } from '../engine/engine.ts'
import { MAX_SOURCES } from '../engine/params.ts'
import { createStore } from '../listeners.ts'
import { bench } from './bench.ts'
import { buildMap, drawMap } from './chain-map.ts'
import styles from './ChainMap.module.css'
import { CHANNELS, GROUPS, STAGE_ORDER, type Group } from './controls/index.ts'
import { useStoreValue } from './ControlsContext.ts'
import { added, removable, shownOn, takeOff } from './fitted.ts'
import { listView, setListView, VIEWS } from './listView.ts'
import { useCoarse } from './measure.ts'
import { Menu } from './Menu.tsx'
import { read, write } from './persist.ts'
import { watchRail } from './railWatch.ts'
import { aimAt } from './reveal.ts'
import { SettingFind } from './SettingFind.tsx'
import { Shelf } from './Shelf.tsx'
import { formerName } from './stageNames.ts'
import { Tip } from './Tip.tsx'
import { ToggleButtonGroup } from './ToggleButtonGroup.tsx'
import { watchTriggers } from './triggerWatch.ts'

import type { Controls } from '../controls.ts'
import type { El } from './svg.ts'

const GROUP_BY_NAME = new Map(GROUPS.map(g => [g.name, g]))

const FOLD_KEY = 'bender.mapFolded'
const mapFolded = createStore(read(FOLD_KEY) === '1')
const foldMap = (folded: boolean) => {
  mapFolded.set(folded)
  write(FOLD_KEY, folded ? '1' : '0')
}

const SOUNDING = CHANNELS.filter(c => c.tap < MAX_SOURCES)

const REDRAW_MS = 120

const SAGGING = 0.85

const SAG_HOLD_MS = 1500

function useSettledControls(): Controls {
  const [controls, setControls] = useState(engine.controls.get)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let drawnAt = 0
    const draw = () => {
      timer = undefined
      drawnAt = performance.now()
      setControls(engine.controls.get())
    }
    const off = engine.controls.subscribe(() => {
      if (timer !== undefined) return
      const wait = REDRAW_MS - (performance.now() - drawnAt)
      if (wait <= 0) draw()
      else timer = setTimeout(draw, wait)
    })
    return () => {
      off()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])
  return controls
}

function mount(node: El | string, key: number): ReactNode {
  if (typeof node === 'string') return node
  return createElement(node.tag, { key, ...node.attrs }, node.kids?.map(mount))
}

export function ChainMap({
  open,
  onOpen,
  seconds,
}: {
  open: string | null
  onOpen: (name: string) => void
  seconds: number
}) {
  const controls = useSettledControls()
  const coarse = useCoarse()
  const lit = useStoreValue(engine.sounding)
  const playing = SOUNDING.filter(c => lit & (1 << c.tap)).map(c => c.name)
  const benchNow = useStoreValue(bench)
  const graph = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let shown = ''
    let lowUntil = 0
    return watchRail((rail, rebooting) => {
      const now = performance.now()
      if (rail < SAGGING) lowUntil = now + SAG_HOLD_MS
      const state = rebooting ? 'reboot' : now < lowUntil ? 'low' : ''
      if (!graph.current || state === shown) return
      shown = state
      if (state) graph.current.dataset.rail = state
      else delete graph.current.dataset.rail
    })
  }, [])
  useEffect(
    () => (graph.current ? watchTriggers(graph.current) : undefined),
    [],
  )
  useStoreValue(added)
  const folded = useStoreValue(mapFolded) && open !== null
  const shown = shownOn(controls, benchNow)
  if (open) shown.add(open)
  const map = buildMap(controls, {
    wrap: true,
    loop: true,
    open: open ?? undefined,
    playing,
    benched: benchNow.pedals,
    shown,
  })
  const onIt = GROUPS.filter(g => shown.has(g.name))
  const offIt = GROUPS.filter(g => !shown.has(g.name))

  const press = (target: Element): boolean => {
    const door = target.closest('[data-door]')
    const group = GROUP_BY_NAME.get(door?.getAttribute('data-door') ?? '')
    if (!group) return false
    const key = door!.getAttribute('data-key')
    if (!key || open !== group.name) onOpen(group.name)
    if (key) aimAt(key, graph.current)
    return true
  }

  const click = (e: MouseEvent) => {
    if (e.target instanceof Element && press(e.target)) e.preventDefault()
  }

  return (
    <div className={styles.map}>
      {(coarse || folded) && (
        <Shelf
          groups={onIt}
          label="stages"
          open={open}
          onOpen={onOpen}
          seconds={seconds}
        />
      )}
      <div
        ref={graph}
        className={styles.graph}
        role="group"
        aria-label="signal path"
        hidden={folded}
        onClick={click}
      >
        {mount(drawMap(map), 0)}
      </div>
      {!coarse && !folded && (
        <Shelf
          groups={onIt.filter(g => !map.doors.has(g.name))}
          label="on the board"
          open={open}
          onOpen={onOpen}
          seconds={seconds}
        />
      )}
      <StageBar
        on={onIt}
        off={offIt}
        open={open}
        onOpen={onOpen}
        seconds={seconds}
      >
        {open !== null && !coarse && (
          <Tip
            text={
              folded
                ? 'Show the map again.'
                : 'Fold the map to a row of stages.'
            }
          >
            <button
              className={styles.add}
              aria-label={folded ? 'show the map' : 'fold the map'}
              aria-pressed={folded}
              onClick={() => foldMap(!folded)}
            >
              {folded ? '▾' : '▴'}
            </button>
          </Tip>
        )}
      </StageBar>
    </div>
  )
}

export function StageBar({
  on,
  off,
  open,
  onOpen,
  seconds,
  children,
}: {
  on: Group[]
  off: Group[]
  open: string | null
  onOpen: (name: string) => void
  seconds: number
  children?: ReactNode
}) {
  const listed = useStoreValue(listView)
  return (
    <div className={styles.addRow}>
      <ToggleButtonGroup
        label="stage view"
        options={VIEWS}
        value={listed ? 'all settings' : 'diagram'}
        onChange={view => setListView(view === 'all settings')}
      />
      {children}
      <StageMenu
        groups={off}
        button="+ add a stage"
        label="add a stage"
        former
        onPick={onOpen}
      />
      <StageMenu
        groups={on.filter(g => removable(g.name))}
        button="− take off"
        label="take off a stage"
        onPick={name => {
          const group = GROUP_BY_NAME.get(name)!
          engine.morphTo(takeOff(group, engine.controls.get()), seconds)
          if (open === name) onOpen(name)
        }}
      />
      <SettingFind groups={on} open={open} onOpen={onOpen} />
    </div>
  )
}

function StageMenu({
  groups,
  button: text,
  label,
  former = false,
  onPick,
}: {
  groups: { name: string; place: string }[]
  button: string
  label: string
  former?: boolean
  onPick: (name: string) => void
}) {
  const [menu, setMenu] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  if (groups.length === 0) return null
  return (
    <>
      <button
        ref={setButton}
        className={styles.add}
        aria-expanded={menu}
        onClick={() => setMenu(m => !m)}
      >
        {text}
      </button>
      {menu && (
        <Menu
          anchor={button}
          toggle={button}
          role="menu"
          label={label}
          onClose={() => setMenu(false)}
        >
          {STAGE_ORDER.map(place => {
            const here = groups.filter(g => g.place === place)
            if (here.length === 0) return null
            return (
              <div
                key={place}
                role="group"
                aria-label={place}
                className={styles.placeGroup}
              >
                <div className={styles.place}>{place}</div>
                {here.map(g => (
                  <button
                    key={g.name}
                    role="menuitem"
                    className={styles.stage}
                    onClick={() => {
                      if (groups.length === 1) setMenu(false)
                      onPick(g.name)
                    }}
                  >
                    {g.name}
                    {former && formerName(g.name) && (
                      <span className={styles.was}>
                        {` (${formerName(g.name)})`}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )
          })}
        </Menu>
      )}
    </>
  )
}

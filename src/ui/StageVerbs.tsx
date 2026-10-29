import { useState, type ReactNode } from 'react'

import { engine } from '../engine/engine.ts'
import { useBoardValue } from './ControlsContext.ts'
import { SHUFFLE } from './DeviceVerbs.tsx'
import { removable, takeOff } from './fitted.ts'
import { Menu } from './Menu.tsx'
import { menuItem } from './menuItems.ts'
import {
  applyCut,
  applyRig,
  cutOff,
  cutSays,
  cutsFor,
  cutWired,
  type CutDef,
  rigsFor,
  rigStands,
  rollGroup,
  rollKeys,
} from './presets/index.ts'
import {
  putBack,
  putBackTitle,
  resetIn,
  rollIn,
  undoRoll,
  useCanUndoRoll,
  useStanding,
  useTouchedCount,
} from './rollBack.ts'
import styles from './StageVerbs.module.css'
import { Tip } from './Tip.tsx'

import type { Group, SliderDef } from './controls/index.ts'

const CUTS_SHOWN = 4

export function StageVerbs({
  group,
  seconds,
}: {
  group: Group
  seconds: number
}) {
  const touched = useTouchedCount(group)
  return (
    <ScopeVerbs
      scope={group.name}
      what={group.name}
      seconds={seconds}
      moved={touched}
      rollTip={
        group.editor?.kind === 'drums'
          ? 'randomize this stage — the kit is the one whose pattern is part of it, so this writes the grid too, at the tempo you already had'
          : `randomize every control in ${group.name} and leave the rest of the board alone`
      }
      resetTip={putBackTitle(group, touched)}
      onRoll={() =>
        rollIn(
          group.name,
          rollGroup(group, engine.controls.get(), Math.random),
          seconds,
        )
      }
      onReset={() => putBack(group, seconds)}
    />
  )
}

const rollTipFor = (count: number, what: string, stage: string) =>
  `Randomize the ${count} controls under ${what} and leave the rest of ${stage} where it stands.`

const resetTipFor = (what: string, moved: number) =>
  `put ${what}'s ${moved} moved controls back where they booted — ctrl+z brings them again`

export function ScopeVerbs({
  scope,
  what,
  seconds,
  moved,
  rollTip,
  resetTip,
  onRoll,
  onReset,
}: {
  scope: string
  what: string
  seconds: number
  moved: number
  rollTip: string
  resetTip: string
  onRoll: () => void
  onReset: () => void
}) {
  const canUndo = useCanUndoRoll(scope)
  return (
    <>
      <Tip text={rollTip}>
        <button className={styles.verb} aria-label="randomize" onClick={onRoll}>
          {SHUFFLE}
        </button>
      </Tip>
      {canUndo && (
        <Tip
          text={`put ${what} back where it stood before its last randomize, and leave every other control where it is now`}
        >
          <button
            className={styles.verb}
            aria-label="undo randomize"
            onClick={() => undoRoll(scope, seconds)}
          >
            undo
          </button>
        </Tip>
      )}
      {moved > 0 && (
        <Tip text={resetTip}>
          <button className={styles.reset} onClick={onReset}>
            {`reset ${moved}`}
          </button>
        </Tip>
      )}
    </>
  )
}

export function MoreMenu({
  group,
  seconds,
  onClose,
}: {
  group: Group
  seconds: number
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const canTakeOff = removable(group.name)
  if (!canTakeOff) return null
  return (
    <>
      <button
        ref={setButton}
        className={styles.verb}
        aria-label={`more for ${group.name}`}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        ⋯
      </button>
      {open && (
        <Menu
          anchor={button}
          toggle={button}
          role="menu"
          onClose={() => setOpen(false)}
        >
          {canTakeOff && (
            <Tip
              text={`Take ${group.name} off the board and the map. A stage with a level or mix gets it turned off and keeps its other knobs; any other goes back to where it booted. Rolls leave it alone until you add it again.`}
            >
              <button
                role="menuitem"
                className={menuItem(false)}
                onClick={() => {
                  setOpen(false)
                  engine.morphTo(takeOff(group, engine.controls.get()), seconds)
                  onClose()
                }}
              >
                take off
              </button>
            </Tip>
          )}
        </Menu>
      )}
    </>
  )
}

export function PartVerbs({
  cuts,
  group,
  part,
  rows,
  moved,
  standing,
  seconds,
}: {
  cuts: CutDef[]
  group: Group
  part: string
  rows: SliderDef[]
  moved: number
  standing: string
  seconds: number
}) {
  const keys = rows.map(d => d.key)
  const scope = `${group.name} › ${part}`
  return (
    <CutRow
      cuts={cuts}
      group={group}
      part={part}
      standing={standing}
      seconds={seconds}
      lead={
        <span className={styles.partVerbs}>
          <ScopeVerbs
            scope={scope}
            what={part}
            seconds={seconds}
            moved={moved}
            rollTip={rollTipFor(rows.length, part, group.name)}
            resetTip={resetTipFor(part, moved)}
            onRoll={() =>
              rollIn(
                scope,
                rollKeys(engine.controls.get(), keys, Math.random, true),
                seconds,
              )
            }
            onReset={() => resetIn(keys, seconds)}
          />
        </span>
      }
    />
  )
}

function CutRow({
  cuts,
  group,
  part,
  standing,
  seconds,
  lead,
}: {
  cuts: CutDef[]
  group: Group
  part: string
  standing: string
  seconds: number
  lead?: ReactNode
}) {
  const wired = useBoardValue(c => cutWired(group.name, part, c))
  const [open, setOpen] = useState(false)
  const shownCuts = open
    ? cuts
    : cuts.filter((cut, i) => i < CUTS_SHOWN || cut.name === standing)
  const hidden = cuts.length - shownCuts.length
  if (!lead && cuts.length === 0) return null
  return (
    <div className={styles.cuts}>
      {lead}
      {shownCuts.map(cut => (
        <Tip
          key={cut.name}
          text={`${cut.blurb}. One press: ${cutSays(cut)} — which is where it lands in the rows under here.`}
        >
          <button
            className={standing === cut.name ? styles.cutOn : styles.cut}
            onClick={() =>
              engine.morphTo(applyCut(cut, engine.controls.get()), seconds)
            }
          >
            {cut.name}
          </button>
        </Tip>
      ))}
      {hidden > 0 && (
        <button className={styles.cutMore} onClick={() => setOpen(true)}>
          {`${hidden} more`}
        </button>
      )}
      {cuts.length > 0 && (wired || open) && (
        <Tip
          text={
            wired
              ? `clear the faults on ${group.name}'s buses and leave the rest of the stage alone`
              : `there is no fault on ${group.name}'s buses`
          }
        >
          <button
            className={wired ? styles.cut : styles.cutOff}
            disabled={!wired}
            onClick={() =>
              engine.morphTo(
                cutOff(group.name, part, engine.controls.get()),
                seconds,
              )
            }
          >
            none
          </button>
        </Tip>
      )}
    </div>
  )
}

export function Rigs({ group, seconds }: { group: Group; seconds: number }) {
  const rigs = rigsFor(group.name)
  const standing = useBoardValue(
    c => rigs.find(rig => rigStands(rig, c))?.name ?? '',
  )
  if (rigs.length === 0) return null
  return (
    <div className={styles.rigs}>
      <span className={styles.rigsLabel}>settings</span>
      {rigs.map(rig => (
        <Tip
          key={rig.name}
          text={`${rig.blurb}. One press: ${group.name} goes back to stock and this is written over it — the rows under here say what it became.`}
        >
          <button
            className={standing === rig.name ? styles.cutOn : styles.cut}
            onClick={() =>
              engine.morphTo(applyRig(rig, engine.controls.get()), seconds)
            }
          >
            {rig.name}
          </button>
        </Tip>
      ))}
    </div>
  )
}

export function BoxVerbs({
  group,
  part,
  seconds,
}: {
  group: Group
  part: string
  seconds: number
}) {
  const cuts = cutsFor(group.name, part)
  const standing = useStanding(cuts)
  return (
    <CutRow
      cuts={cuts}
      group={group}
      part={part}
      standing={standing}
      seconds={seconds}
    />
  )
}

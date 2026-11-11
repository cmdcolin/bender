import { engine } from '../engine/engine.ts'
import { isPedal, pedalNamed } from '../pedals.ts'
import {
  bypassed,
  patchedOn,
  positionOf,
  sounds,
  switchOff,
  switchOn,
} from './bendChain.ts'
import { pedalWet } from './chain-map.ts'
import { useBoardValue } from './ControlsContext.ts'

import type { Controls } from '../controls.ts'

const ADDED_MIX = 0.5

type Power = 'on' | 'bypassed' | 'dry' | 'unslotted'

const pedalPower = (c: Controls, stage: string): Power => {
  const { mute } = pedalNamed(stage)!
  return c[mute] > 0.5 ? 'bypassed' : pedalWet(c, stage) ? 'on' : 'dry'
}

const bendPower = (c: Controls, stage: string): Power =>
  sounds(c, stage)
    ? 'on'
    : positionOf(c, stage) === 0 && !patchedOn(c, stage)
      ? 'unslotted'
      : bypassed(c, stage)
        ? 'bypassed'
        : 'dry'

const powerOf = (c: Controls, stage: string) =>
  isPedal(stage) ? pedalPower(c, stage) : bendPower(c, stage)

export function switchPedalOn(stage: string) {
  const { mix, mute } = pedalNamed(stage)!
  const board = engine.controls.get()
  if (board[mix] === 0 || board[mute] > 0.5) {
    engine.armStep()
    engine.writeBoard({
      ...board,
      [mix]: board[mix] === 0 ? ADDED_MIX : board[mix],
      [mute]: 0,
    })
  }
}

function switchPowerOff(stage: string) {
  if (isPedal(stage)) {
    engine.armStep()
    engine.set(pedalNamed(stage)!.mute, 1)
  } else switchOff(stage)
}

const switchPowerOn = (stage: string) =>
  isPedal(stage) ? switchPedalOn(stage) : switchOn(stage)

const tipOf = (stage: string, power: Power) =>
  ({
    on: `Press to take ${stage} out of the path. Its knobs stay where they are.`,
    bypassed: `${stage} is bypassed. Press to switch it back on at the sound you left.`,
    dry: `${stage} is silent with its mix at 0. Press to bring the mix up.`,
    unslotted: `${stage} is in no chain position. Press to slot it in.`,
  })[power]

export function usePower(stage: string) {
  const power = useBoardValue(c => powerOf(c, stage))
  return {
    on: power === 'on',
    tip: tipOf(stage, power),
    flip: () => (power === 'on' ? switchPowerOff(stage) : switchPowerOn(stage)),
  }
}

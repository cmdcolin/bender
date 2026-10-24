import { bench, setBench } from './bench.ts'
import { positionOf, sounds, stepOf, switchOff, switchOn } from './bendChain.ts'
import { useBendStages } from './bendStages.ts'
import { BEND_SLOT_KEYS } from './controls/index.ts'
import { useBoardValue, useMeterValue } from './ControlsContext.ts'
import styles from './Pedals.module.css'
import { Footswitch, StompFace, type Face } from './StompFace.tsx'
import { Tip } from './Tip.tsx'

const FACE: Record<string, Face> = {
  'Ring mod': {
    colour: '#9a6a1f',
    switch: 'ringShape',
    sliders: ['ringHz', 'ringMix'],
  },
  Crusher: {
    colour: '#566b2a',
    sliders: ['bits', 'srHz', 'crushMix'],
  },
  Clipper: {
    colour: '#8f3045',
    switch: 'distMode',
    sliders: ['driveDb', 'distToneHz', 'distMix'],
  },
  Comb: {
    colour: '#2b6b7a',
    sliders: ['combHz', 'combFb', 'combMix'],
  },
  'Glitch buffer': {
    colour: '#7a3f8f',
    switch: 'glitchPitch',
    sliders: ['glitchProb', 'glitchSliceMs', 'glitchMix'],
  },
  'Screech filter': {
    colour: '#a0522d',
    switch: 'filtMode',
    sliders: ['filtHz', 'filtRes', 'filtMix'],
  },
  'Freq shifter': {
    colour: '#3a5f9a',
    switch: 'shiftDir',
    sliders: ['shiftHz', 'shiftFb', 'shiftMix'],
  },
  Octave: {
    colour: '#6b6b2a',
    switch: 'octDiv',
    sliders: ['octUp', 'octSub', 'octMix'],
  },
}

function reading(stage: string, at: number, step: number, open: boolean) {
  if (at === 0)
    return {
      text: 'off',
      label: 'in no position',
      tip: `${stage} is in no position, so the signal never reaches it.`,
    }
  if (open)
    return {
      text: 'drop',
      label: `position ${at}, dropped`,
      tip: `The joint under ${stage} is open, so it is out of the path until the joint closes.`,
    }
  if (step !== at)
    return {
      text: `now ${step}`,
      label: `position ${at}, running at ${step}`,
      tip: `${stage} is set to position ${at}, and Re-solder has moved it to ${step}.`,
    }
  return {
    text: String(at),
    label: `position ${at}`,
    tip: `${stage} runs at position ${at} of ${BEND_SLOT_KEYS.length} in the bend chain.`,
  }
}

function Position({ stage }: { stage: string }) {
  const at = useBoardValue(c => positionOf(c, stage))
  const [order, mask] = useMeterValue(
    m => `${m.walk.join('')}:${m.dropped}`,
  ).split(':')
  const walk = order!.split('').map(Number)
  const step = useBoardValue(c => stepOf(c, walk, stage))
  const open = step > 0 && (Number(mask) & (1 << (step - 1))) !== 0
  const { text, label, tip } = reading(stage, at, step, open)
  return (
    <Tip text={tip}>
      <span className={styles.badge} role="img" aria-label={label}>
        {text}
      </span>
    </Tip>
  )
}

function BendFace({
  stage,
  seconds,
  onOpen,
}: {
  stage: string
  seconds: number
  onOpen: (stage: string) => void
}) {
  const face = FACE[stage]!
  const on = useBoardValue(c => sounds(c, stage))
  const off = useBoardValue(c => positionOf(c, stage) === 0)
  return (
    <StompFace
      stage={stage}
      face={face}
      seconds={seconds}
      onOpen={onOpen}
      onClose={() =>
        setBench({
          ...bench.get(),
          bends: bench.get().bends.filter(b => b !== stage),
        })
      }
      badge={<Position stage={stage} />}
      footswitch={
        <Footswitch
          stage={stage}
          bypassed={!on}
          tip={
            on
              ? `Press to take ${stage} out of the sound. Its knobs stay where they are.`
              : off
                ? `${stage} is in no chain position. Press to slot it in.`
                : `${stage} is silent with its mix at 0. Press to bring it back at the mix you left.`
          }
          onPress={() => (on ? switchOff(stage) : switchOn(stage))}
        />
      }
    />
  )
}

export function BendShelf({
  seconds,
  onOpen,
}: {
  seconds: number
  onOpen: (stage: string) => void
}) {
  return (
    <>
      {useBendStages().map(stage => (
        <BendFace key={stage} stage={stage} seconds={seconds} onOpen={onOpen} />
      ))}
    </>
  )
}

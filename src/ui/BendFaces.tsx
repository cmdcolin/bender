import { bench, setBench } from './bench.ts'
import { positionOf, sounds, switchOff, switchOn } from './bendChain.ts'
import { useBendStages } from './bendStages.ts'
import { BEND_SLOT_KEYS } from './controls/index.ts'
import { useBoardValue } from './ControlsContext.ts'
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

function Position({ stage }: { stage: string }) {
  const at = useBoardValue(c => positionOf(c, stage))
  return (
    <Tip
      text={
        at > 0
          ? `${stage} runs at position ${at} of ${BEND_SLOT_KEYS.length} in the bend chain.`
          : `${stage} is in no position, so the signal never reaches it.`
      }
    >
      <span
        className={styles.badge}
        role="img"
        aria-label={at > 0 ? `position ${at}` : 'in no position'}
      >
        {at > 0 ? at : 'off'}
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

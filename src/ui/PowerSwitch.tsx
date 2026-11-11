import { usePower } from './power.ts'
import { Tip } from './Tip.tsx'
import { ToggleButtonGroup } from './ToggleButtonGroup.tsx'

import type { ControlKey } from '../controls.ts'

const SIDES = ['on', 'off'] as const

export function PowerSwitch({
  stage,
  control,
}: {
  stage: string
  control?: ControlKey
}) {
  const { on, tip, flip } = usePower(stage)
  return (
    <Tip text={tip}>
      <span data-control={control}>
        <ToggleButtonGroup
          label={`${stage} power`}
          options={SIDES}
          lit="on"
          value={on ? 'on' : 'off'}
          onChange={side => {
            if ((side === 'on') !== on) flip()
          }}
        />
      </span>
    </Tip>
  )
}

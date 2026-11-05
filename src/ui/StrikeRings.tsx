import { useStoreSelect } from './ControlsContext.ts'
import { strikes, type Struck } from './strikes.ts'

export function StrikeRings({
  target,
  width,
  height,
  r,
  className,
}: {
  target: Struck
  width: number
  height: number
  r: number
  className?: string
}) {
  const shown = useStoreSelect(strikes, s => s[target])
  return shown.map(s => (
    <circle
      key={s.id}
      className={className}
      cx={s.x * width}
      cy={s.y * height}
      r={r}
    />
  ))
}

import bus from './BusDiagram.module.css'
import { Wire } from './DiagramParts.tsx'

const HEAD = 5

export function BendLead({
  d,
  x,
  y,
  down,
  on,
  arrow,
}: {
  d: string
  x: number
  y: number
  down: boolean
  on: boolean
  arrow: string
}) {
  const back = y + (down ? -HEAD : HEAD)
  return on ? (
    <>
      <path d={d} className={bus.jumper} strokeDasharray="3 2" />
      <path
        d={`M${x} ${y} L${x - HEAD / 2} ${back} L${x + HEAD / 2} ${back} Z`}
        className={bus.solder}
      />
    </>
  ) : (
    <Wire arrow={arrow} d={d} look="dash" />
  )
}

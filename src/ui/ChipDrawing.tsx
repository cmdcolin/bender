import chip from './ChipLook.module.css'
import { Diagram } from './DiagramParts.tsx'

import type { ComponentProps } from 'react'

// A drawing in the chip look, held at its own width when narrower than the column.
export function ChipDrawing({
  maxWidth,
  ...diagram
}: ComponentProps<typeof Diagram> & { maxWidth?: number }) {
  return (
    <div
      className={chip.chips}
      style={maxWidth ? { maxWidth, marginInline: 'auto' } : undefined}
    >
      <Diagram {...diagram} />
    </div>
  )
}

import chip from './ChipLook.module.css'
import { Diagram } from './DiagramParts.tsx'

import type { ComponentProps } from 'react'

// Draws a diagram in the chip look. A `maxWidth` keeps a narrow drawing at its
// own size.
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

import { foldDrawing, type DrawingProps } from './drawingFor.tsx'

export function FoldDrawing({
  group,
  part,
  ...props
}: DrawingProps & {
  group: string
  part: string
}) {
  return foldDrawing(group, part, props)
}

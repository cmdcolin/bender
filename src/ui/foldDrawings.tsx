import { foldDrawing, type DrawingProps } from './drawingFor.tsx'

export function FoldDrawing({
  group,
  part,
  ...props
}: Omit<DrawingProps, 'zoom'> & {
  group: string
  part: string
}) {
  return foldDrawing(group, part, props)
}

/** Where a pointer is on a face drawing, as fractions of its viewBox. */
export function faceSpot(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  width: number,
  height: number,
) {
  const toDrawing = svg.getScreenCTM()?.inverse()
  const box = svg.getBoundingClientRect()
  const at = toDrawing
    ? new DOMPoint(clientX, clientY).matrixTransform(toDrawing)
    : {
        x: ((clientX - box.left) / box.width) * width,
        y: ((clientY - box.top) / box.height) * height,
      }
  return { x: at.x / width, y: at.y / height }
}

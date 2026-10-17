export const noiseTile = (size = 128): string | undefined => {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  const image = ctx.createImageData(size, size)
  for (let i = 0; i < image.data.length; i += 4) {
    const level = Math.random() * 255
    image.data[i] = level
    image.data[i + 1] = level
    image.data[i + 2] = level
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

// A voice has no picture, so it gets a mark instead: eleven bars whose heights
// come from the board's own hash. Two boards that differ anywhere differ here,
// and the same board draws the same mark on every machine — which is all a card
// needs to be told apart at a glance in a grid of a dozen.
//
// Deliberately not a reading of the board. The bars are not levels and do not
// mean anything; a mark that looked like a spectrum would be claiming to show
// what a voice sounds like.
export const BARS = 11

// FNV-1a, for a spread that changes everywhere when one character does.
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** The bar heights, 0.18 to 1, for a board. */
export function markBars(query: string): number[] {
  const bars: number[] = []
  for (let i = 0; i < BARS; i++) {
    const h = hash(`${i}:${query}`)
    bars.push(0.18 + ((h >>> 8) % 1000) / 1000 / 1.22)
  }
  return bars
}

const SVG = 'http://www.w3.org/2000/svg'

export function markFor(query: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', `0 0 ${BARS * 6 - 2} 24`)
  svg.setAttribute('class', 'mark')
  svg.setAttribute('aria-hidden', 'true')
  markBars(query).forEach((v, i) => {
    const bar = document.createElementNS(SVG, 'rect')
    bar.setAttribute('x', String(i * 6))
    bar.setAttribute('width', '4')
    bar.setAttribute('y', String(24 - v * 24))
    bar.setAttribute('height', String(v * 24))
    bar.setAttribute('rx', '1')
    svg.append(bar)
  })
  return svg
}

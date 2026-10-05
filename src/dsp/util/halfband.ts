// Takes a signal running at twice the board's rate back down to it: a 63-tap
// half-band low-pass, passing to 20 kHz and stopping from 28 kHz at 48 kHz out.
const TAPS = 63
const CENTRE = (TAPS - 1) / 2
const BETA = 8

function besselI0(x: number): number {
  let sum = 1
  let term = 1
  for (let k = 1; k < 32; k++) {
    term *= (x / (2 * k)) ** 2
    sum += term
  }
  return sum
}

function design(): { centre: number; side: Float64Array } {
  const side = new Float64Array((CENTRE + 1) / 2)
  let total = 0.5
  for (let j = 0; j < side.length; j++) {
    const off = 2 * j + 1
    const sinc = Math.sin((Math.PI * off) / 2) / (Math.PI * off)
    const w =
      besselI0(BETA * Math.sqrt(1 - (off / (CENTRE + 1)) ** 2)) / besselI0(BETA)
    side[j] = sinc * w
    total += 2 * side[j]!
  }
  for (let j = 0; j < side.length; j++) side[j]! /= total
  return { centre: 0.5 / total, side }
}

const { centre: CENTRE_TAP, side: SIDE } = design()

export class Halfband {
  private readonly buf = new Float64Array(TAPS * 2)
  private at = 0

  /** Two samples at the doubled rate in, one at the board's rate out. */
  process(a: number, b: number): number {
    const buf = this.buf
    buf[this.at] = buf[this.at + TAPS] = a
    this.at = this.at + 1 === TAPS ? 0 : this.at + 1
    buf[this.at] = buf[this.at + TAPS] = b
    this.at = this.at + 1 === TAPS ? 0 : this.at + 1
    const start = this.at
    let y = CENTRE_TAP * buf[start + CENTRE]!
    for (let j = 0; j < SIDE.length; j++) {
      const off = 2 * j + 1
      y += SIDE[j]! * (buf[start + CENTRE - off]! + buf[start + CENTRE + off]!)
    }
    return y
  }

  reset() {
    this.buf.fill(0)
    this.at = 0
  }
}

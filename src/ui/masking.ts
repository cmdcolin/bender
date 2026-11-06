import { N_BANDS } from '../dsp/util/bandMeter.ts'

const BAND_NAMES = ['sub', 'low', 'mid', 'presence', 'air'] as const

const OCTAVE_BAND = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4] as const satisfies {
  length: typeof N_BANDS
}

export const MASK_DB = 6
const MASK_RATIO = 10 ** (MASK_DB / 10)
const SHOWN_DB = -70
const SHOWN_SHARE = 0.05

interface Row {
  name: string
  row: number
}

const round2 = (x: number) => Math.round(x * 100) / 100

/** Each row's octave power over a run of meter posts, and how much of it sat
    under the other rows together by `MASK_DB` or more, post by post. */
export class BandTally {
  private frames = 0
  private readonly rows: number
  private readonly power: Float64Array
  private readonly masked: Float64Array
  private readonly by: Float64Array

  constructor(rows: number) {
    this.rows = rows
    this.power = new Float64Array(rows * N_BANDS)
    this.masked = new Float64Array(rows * N_BANDS)
    this.by = new Float64Array(rows * rows)
  }

  add(levels: Float32Array) {
    this.frames++
    const { rows, power, masked, by } = this
    for (let o = 0; o < N_BANDS; o++) {
      let total = 0
      let first = -1
      let second = -1
      let firstP = 0
      let secondP = 0
      for (let r = 0; r < rows; r++) {
        const v = levels[r * N_BANDS + o] ?? 0
        const p = v * v
        total += p
        if (p > firstP) {
          second = first
          secondP = firstP
          first = r
          firstP = p
        } else if (p > secondP) {
          second = r
          secondP = p
        }
      }
      for (let r = 0; r < rows; r++) {
        const v = levels[r * N_BANDS + o] ?? 0
        const p = v * v
        if (p > 0) {
          const j = r * N_BANDS + o
          power[j] = power[j]! + p
          if (total - p > p * MASK_RATIO) {
            const k = r * rows + (r === first ? second : first)
            masked[j] = masked[j]! + p
            by[k] = by[k]! + p
          }
        }
      }
    }
  }

  private bandPower(row: number) {
    const sums = BAND_NAMES.map(() => 0)
    for (let o = 0; o < N_BANDS; o++)
      sums[OCTAVE_BAND[o]!]! += this.power[row * N_BANDS + o]!
    return sums
  }

  /** Each row's level in each band averaged over the posts, in dBFS, a sine
      at a band's centre reading its own peak. */
  bands(heard: readonly Row[]) {
    const frames = Math.max(this.frames, 1)
    return Object.fromEntries(
      heard.map(({ name, row }) => [
        name,
        Object.fromEntries(
          this.bandPower(row).flatMap((p, b) => {
            const db = 10 * Math.log10(p / frames)
            return db > SHOWN_DB ? [[BAND_NAMES[b]!, Math.round(db)]] : []
          }),
        ),
      ]),
    )
  }

  /** Each band's power split among the heard rows, largest first. */
  owners(heard: readonly Row[]) {
    const per = heard.map(({ name, row }) => ({
      name,
      power: this.bandPower(row),
    }))
    return Object.fromEntries(
      BAND_NAMES.flatMap((band, b) => {
        const total = per.reduce((sum, r) => sum + r.power[b]!, 0)
        const shares = per
          .map(r => ({
            name: r.name,
            share: total > 0 ? r.power[b]! / total : 0,
          }))
          .filter(r => r.share >= SHOWN_SHARE)
          .toSorted((x, y) => y.share - x.share)
        return shares.length > 0
          ? [
              [
                band,
                Object.fromEntries(shares.map(r => [r.name, round2(r.share)])),
              ],
            ]
          : []
      }),
    )
  }

  /** For each lead, the share of its power that sat under the rest, the row
      that covered most of it, and the band most of it was lost in. */
  masking(leads: readonly Row[], all: readonly Row[]) {
    return Object.fromEntries(
      leads.flatMap(({ name, row }) => {
        let own = 0
        let lost = 0
        const lostIn = BAND_NAMES.map(() => 0)
        for (let o = 0; o < N_BANDS; o++) {
          const j = row * N_BANDS + o
          own += this.power[j]!
          lost += this.masked[j]!
          lostIn[OCTAVE_BAND[o]!]! += this.masked[j]!
        }
        const covered = (r: Row) => this.by[row * this.rows + r.row]!
        const top = all
          .filter(r => r.row !== row)
          .toSorted((x, y) => covered(y) - covered(x))[0]
        const band = lostIn.indexOf(Math.max(...lostIn))
        return own > 0
          ? [
              [
                name,
                lost / own >= SHOWN_SHARE && top
                  ? {
                      share: round2(lost / own),
                      by: top.name,
                      band: BAND_NAMES[band]!,
                    }
                  : { share: round2(lost / own) },
              ],
            ]
          : []
      }),
    )
  }
}

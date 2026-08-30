// What the bend space of a chip actually sounds like, by frequency.
//
//   pnpm spectrum          every bus on every chip
//   pnpm spectrum fm       one chip
//   pnpm spectrum cuts     the row of named cuts, and the presets
//
// `knife.ts` answers whether a wire does anything, which is a fact about a ROM.
// This answers what it does, which is the question you actually have when
// somebody says the bends all sound the same — and they usually mean the same
// as each other rather than the same as no bend, so a list of how far each one
// moved is no help. What helps is where each one put the energy.
//
// Two columns carry it. `flat` is spectral flatness: a sine is 0, white noise
// is 1, and a chip whose only primitive is a sine has no way to get near the
// top of that on its own. The five bands are where the power sat. A bend space
// worth having spreads down those columns; one that does not is a row of
// numbers all reading 0.00 in `sub` and 0.4 in `hi`, which is what this chip's
// looked like before it had a percussion bank.
//
// A chip that can be more than one machine gets a `reach` line per machine —
// see FM_MODES. That is not a refinement: measured in melody alone the FM
// chip's data bus reads 0.21 flat with nothing broadband, and with the
// percussion bank on the same forty faults read 0.94 with eight of them
// carrying a bottom. A report that saw only the first would send you off
// building a noise source for a chip that already has one.
import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../src/controls'
import { FAULT } from '../src/dsp/bus'
import { BANDS, spectrum } from '../src/dsp/spectrum'
import { render, renderStems, rms, SR } from '../src/dsp/testRender'
import { SOURCE_TAPS, type SourceTap } from '../src/engine/params'
import { romIndex } from '../src/dsp/stages/roms'
import { FM_EFFECT_NAMES } from '../src/dsp/stages/fmEffects'
import { ANY_CHOICE } from '../src/dsp/trigbus'
import { applyCut, CUTS, cutOff } from '../src/ui/presets/cuts'
import { PRESETS } from '../src/ui/presets/table'
import { sliderFor } from '../src/ui/controls'

// The same board `knife.ts` judges a wire on, for the same reasons: the song
// run up to where all of it goes past, and a bar whose halves differ.
const BOARD: Partial<Controls> = {
  chipTune: romIndex('sakura'),
  chipClockX: 6,
  drumBpm: 160,
  drumKick: 0b1010_0100_0000_0010,
  drumSnare: 0b0000_1000_0000_0000,
  drumHat: 0b1010_1010_1010_1010,
  drumClap: 0b0000_0000_1000_0000,
  drumTom: 0b0000_0010_0000_0100,
  drumBell: 0b0001_0000_0000_1000,
  drumAccent: 0b1000_0000_0010_0000,
}

interface BusDef {
  chip: string
  bus: string
  line: ControlKey
  fault: ControlKey
  depth: ControlKey
  solo: Partial<Controls>
  tap: SourceTap
  /** the other machines this chip can be, if it can be more than one */
  modes?: [name: string, board: Partial<Controls>][]
}

const TOY = { drumLevel: 0, fmLevel: 0 }
const KIT = { chipLevel: 0, fmLevel: 0 }
// The FM chip has no sequencer, so the toy stays in under it striking notes —
// and the measurement comes off the chip's own stem rather than the mix, or
// what is being measured is two chips.
const FM = { drumLevel: 0.4, chipLevel: 0.2, fmLevel: 0.9 }

// A chip that can be more than one machine has to be measured as more than one,
// or the report describes whichever machine it happened to be left in.
//
// The FM chip is three. The percussion bank hands its top two channels to a kit
// in ROM and re-taps two operators onto a shift register; the effect ROM takes
// a channel and turns the bus into the busiest traffic on the board. Both
// change what a knife finds, and by more than a little: the same forty faults
// on the data bus read 0.21 flat with one bottom in melody, and 0.94 flat with
// eight in rhythm. Measuring melody alone reported this chip's dullest mode as
// the chip.
//
// Wind rather than any other effect because what matters to a bus fault is the
// traffic, and wind is the one that writes continuously and never stops. The
// per-wire rows stay in melody: those are for finding a wire worth naming, and
// you go hunting in one mode at a time. What the modes are for is the reach
// line, which is the summary and the reason the file exists.
const FM_MODES: [string, Partial<Controls>][] = [
  ['rhythm', { fmRhythm: 1, fmStruck: ANY_CHOICE }],
  ['wind', { fmEffect: FM_EFFECT_NAMES.indexOf('wind') }],
]

const BUSES: BusDef[] = [
  {
    chip: 'toy',
    bus: 'data',
    line: 'chipDataLine',
    fault: 'chipDataFault',
    depth: 'chipBusCut',
    solo: TOY,
    tap: 'toyChip',
  },
  {
    chip: 'toy',
    bus: 'address',
    line: 'chipAddrLine',
    fault: 'chipAddrFault',
    depth: 'chipBusCut',
    solo: TOY,
    tap: 'toyChip',
  },
  {
    chip: 'kit',
    bus: 'data',
    line: 'drumDataLine',
    fault: 'drumDataFault',
    depth: 'drumBusCut',
    solo: KIT,
    tap: 'toyDrum',
  },
  {
    chip: 'kit',
    bus: 'address',
    line: 'drumAddrLine',
    fault: 'drumAddrFault',
    depth: 'drumBusCut',
    solo: KIT,
    tap: 'toyDrum',
  },
  {
    chip: 'fm',
    bus: 'data',
    line: 'fmDataLine',
    fault: 'fmDataFault',
    depth: 'fmBusCut',
    solo: FM,
    tap: 'fmChip',
    modes: FM_MODES,
  },
  {
    chip: 'fm',
    bus: 'address',
    line: 'fmAddrLine',
    fault: 'fmAddrFault',
    depth: 'fmBusCut',
    solo: FM,
    tap: 'fmChip',
    modes: FM_MODES,
  },
  {
    chip: 'fm',
    bus: 'wave',
    line: 'fmWaveLine',
    fault: 'fmWaveFault',
    depth: 'fmBusCut',
    solo: FM,
    tap: 'fmChip',
    modes: FM_MODES,
  },
]

const FAULTS: [name: string, fault: number, depth: number][] = [
  ['cut 0.85', FAULT.cut, 0.85],
  ['cut', FAULT.cut, 1],
  ['to ground', FAULT.ground, 1],
  ['to +V', FAULT.supply, 1],
  ['bridged', FAULT.bridge, 1],
]

const SECONDS = 2
const pad = (s: string, n: number) => s.padEnd(n)
const LABEL = 30

/** One source's own stem, so a neighbour in the mix is not in the answer. */
const stemOf = (c: Partial<Controls>, tap: SourceTap) =>
  renderStems({ ...BOARD, ...c }, SECONDS).stems[SOURCE_TAPS.indexOf(tap)]!

interface Row {
  label: string
  level: number
  centroid: number
  flatness: number
  bands: number[]
}

const measure = (label: string, x: Float32Array, ref: number): Row => {
  const s = spectrum(x, SR)
  return {
    label,
    level: rms(x) / ref,
    centroid: s.centroid,
    flatness: s.flatness,
    bands: s.bands,
  }
}

function header() {
  console.log(
    `  ${pad('', LABEL)}${pad('level', 8)}${pad('centroid', 10)}${pad('flat', 7)}${BANDS.map(b => pad(b, 6)).join('')}`,
  )
}

function print(r: Row, dead = false) {
  if (dead) {
    console.log(
      `  ${pad(r.label.slice(0, LABEL - 1), LABEL)}${pad('silent', 8)}`,
    )
    return
  }
  console.log(
    `  ${pad(r.label.slice(0, LABEL - 1), LABEL)}${pad(r.level.toFixed(2) + 'x', 8)}${pad(Math.round(r.centroid) + ' Hz', 10)}${pad(r.flatness.toFixed(3), 7)}${r.bands.map(v => pad(v.toFixed(2), 6)).join('')}`,
  )
}

/** How much of the space a set of takes covered, which is the whole point. */
function reach(rows: Row[], mode = '') {
  const live = rows.filter(r => r.level > 0.05)
  if (!live.length) return
  const span = (pick: (r: Row) => number) => {
    const v = live.map(pick).sort((a, b) => a - b)
    return [v[0]!, v[v.length - 1]!] as const
  }
  const [loC, hiC] = span(r => r.centroid)
  const [, hiF] = span(r => r.flatness)
  const bassy = live.filter(r => r.bands[0]! > 0.15).length
  const noisy = live.filter(r => r.flatness > 0.3).length
  console.log(
    `  reach${mode && `, ${mode}`}: ${live.length}/${rows.length} audible · centroid ${Math.round(loC)}–${Math.round(hiC)} Hz · flattest ${hiF.toFixed(2)} · ${bassy} with a bottom · ${noisy} broadband`,
  )
}

// One bus swept end to end, on a board that is whatever the mode says. The
// reference is that mode's own unbent take rather than the melody chip's, or
// the level column would be reporting the mode as if it were the fault.
function sweep(def: BusDef, board: Partial<Controls>, show: boolean): Row[] {
  const wires = sliderFor(def.line)
  const base = stemOf(board, def.tap)
  const ref = rms(base)
  if (show) {
    header()
    print(measure('no knife', base, ref))
  }
  const rows: Row[] = []
  for (let wire = 1; wire <= wires.max; wire++) {
    const name = wires.choices![wire]!
    for (const [label, fault, depth] of FAULTS) {
      const x = stemOf(
        { ...board, [def.line]: wire, [def.fault]: fault, [def.depth]: depth },
        def.tap,
      )
      const row = measure(`${name} ${label}`, x, ref)
      rows.push(row)
      if (show) print(row, row.level <= 0.05)
    }
  }
  return rows
}

const only = process.argv[2]

if (only === 'cuts') {
  console.log(
    'The row of named cuts, each against the same board with no knife on it.\n',
  )
  header()
  for (const cut of CUTS) {
    const knife = applyCut(cut, { ...DEFAULT_CONTROLS, ...BOARD })
    const bare = cutOff(cut.group, cut.part, knife)
    const ref = rms(render(bare, SECONDS))
    const x = render(knife, SECONDS)
    print(
      measure(`${cut.group.split(' ')[0]!} ${cut.name}`, x, ref),
      rms(x) < 1e-4,
    )
  }
  console.log(
    '\nThe preset catalog, each against itself with nothing to compare to.\n',
  )
  header()
  for (const preset of PRESETS) {
    const x = render(preset.patch, SECONDS)
    print(measure(preset.name, x, rms(x) || 1), rms(x) < 1e-4)
  }
} else {
  for (const def of BUSES.filter(b => !only || b.chip === only)) {
    console.log(
      `\n${def.chip} · ${def.bus} bus · ${sliderFor(def.line).max} wires`,
    )
    reach(sweep(def, def.solo, true))
    // And the same sweep again for every other machine this chip can be. Rows
    // are not printed twice — what a second mode is here to say is how much of
    // the space it reaches, and that is one line.
    for (const [name, mode] of def.modes ?? [])
      reach(sweep(def, { ...def.solo, ...mode }, false), name)
  }
}

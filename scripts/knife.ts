// Which wires actually do something, measured rather than reasoned about.
//
//   pnpm knife           every bus, every wire, every fault
//   pnpm knife fm        one chip
//
// A bus fault is the one bend on this board whose result is a fact about a ROM
// rather than about a knob: a line the program never drives is a wire you can
// cut and hear nothing, and no amount of prose settles which lines those are.
// So this renders the board twice per combination — knife on, knife off, same
// everything else — and reports what came out. What it is for is the row of
// named cuts in the panel: every one of those has to be a knife you can hear,
// and this is where the ones worth naming come from.
//
// Three numbers per wire. `change` is how far the board moved at all, against
// itself with the trace intact, and a zero there is a wire the song never
// reaches. `pitch` and `sub` are which way it moved — a bus fault is famous for
// going up, and the ones that go down are worth more because nothing else on
// this board finds them.
import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../src/controls'
import { FAULT } from '../src/dsp/bus'
import { pitchHz, render, rms, SR } from '../src/dsp/testRender'
import { romIndex } from '../src/dsp/stages/roms'
import { sliderFor } from '../src/ui/controls'

// The song and the pattern a knife is judged on. Stock sakura is 32 steps at
// three a second, so two seconds of it is six steps and the far end of the
// address bus never comes round at all; the clock runs it up to where the whole
// song goes past. The kit gets a bar whose halves differ for the same reason —
// a pattern that is the same twice over is one no address fault can be heard on.
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

// One chip at a time, because the question is what this knife did and the other
// two machines are only mix. The FM chip keeps the toy in under it: it has no
// keyboard of its own and plays whatever strikes a note over there.
interface BusDef {
  chip: string
  bus: string
  line: ControlKey
  fault: ControlKey
  depth: ControlKey
  solo: Partial<Controls>
}

const TOY = { drumLevel: 0, fmLevel: 0 }
const KIT = { chipLevel: 0, fmLevel: 0 }
const FM = { drumLevel: 0, chipLevel: 0.2, fmLevel: 0.9 }

const BUSES: BusDef[] = [
  {
    chip: 'toy',
    bus: 'data',
    line: 'chipDataLine',
    fault: 'chipDataFault',
    depth: 'chipBusCut',
    solo: TOY,
  },
  {
    chip: 'toy',
    bus: 'address',
    line: 'chipAddrLine',
    fault: 'chipAddrFault',
    depth: 'chipBusCut',
    solo: TOY,
  },
  {
    chip: 'kit',
    bus: 'data',
    line: 'drumDataLine',
    fault: 'drumDataFault',
    depth: 'drumBusCut',
    solo: KIT,
  },
  {
    chip: 'kit',
    bus: 'address',
    line: 'drumAddrLine',
    fault: 'drumAddrFault',
    depth: 'drumBusCut',
    solo: KIT,
  },
  {
    chip: 'fm',
    bus: 'data',
    line: 'fmDataLine',
    fault: 'fmDataFault',
    depth: 'fmBusCut',
    solo: FM,
  },
  {
    chip: 'fm',
    bus: 'address',
    line: 'fmAddrLine',
    fault: 'fmAddrFault',
    depth: 'fmBusCut',
    solo: FM,
  },
  {
    chip: 'fm',
    bus: 'wave',
    line: 'fmWaveLine',
    fault: 'fmWaveFault',
    depth: 'fmBusCut',
    solo: FM,
  },
]

// Weight under a two-pole at 180 Hz as a share of the whole, which is enough to
// tell a board that sat down from one that merely changed.
function sub(x: Float32Array): number {
  const a = Math.exp((-2 * Math.PI * 180) / SR)
  let one = 0
  let two = 0
  let acc = 0
  for (const v of x) {
    one = (1 - a) * v + a * one
    two = (1 - a) * one + a * two
    acc += two * two
  }
  return Math.sqrt(acc / x.length) / (rms(x) + 1e-9)
}

const SECONDS = 2
const board = (overrides: Partial<Controls>) =>
  render({ ...BOARD, ...overrides }, SECONDS)

// Every fault a wire can take, and the cut twice: a trace parted all the way is
// a different sound from one that still carries some of the time, and the panel
// has a control for the difference.
const FAULTS: [name: string, fault: number, depth: number][] = [
  ['cut 0.4', FAULT.cut, 0.4],
  ['cut', FAULT.cut, 1],
  ['to ground', FAULT.ground, 0],
  ['to +V', FAULT.supply, 0],
  ['bridged', FAULT.bridge, 0],
]

const pad = (s: string, n: number) => s.padEnd(n)
const num = (v: number, digits = 2) => v.toFixed(digits).padStart(6)

const only = process.argv[2]
const silent: string[] = []
const bass: string[] = []

for (const def of BUSES.filter(b => !only || b.chip === only)) {
  const wires = sliderFor(def.line)
  const base = board(def.solo)
  const basePitch = pitchHz(base)
  const baseSub = sub(base)
  console.log(
    `\n${def.chip} · ${def.bus} bus · ${wires.max} wires — base ${basePitch.toFixed(0)} Hz, sub ${baseSub.toFixed(3)}`,
  )
  console.log(
    `  ${pad('wire', 6)}${pad('fault', 11)}${pad('change', 8)}${pad('pitch', 8)}sub`,
  )
  for (let wire = 1; wire <= wires.max; wire++) {
    const name = wires.choices![wire]!
    for (const [label, fault, depth] of FAULTS) {
      const out = board({
        ...def.solo,
        [def.line]: wire,
        [def.fault]: fault,
        [def.depth]: fault === FAULT.cut ? depth : DEFAULT_CONTROLS[def.depth],
      })
      const change = rms(base.map((v, i) => v - out[i]!)) / rms(base)
      const where = `${def.chip} ${name} ${label}`
      if (change < 0.02) {
        silent.push(where)
        continue
      }
      const pitch = pitchHz(out) / basePitch
      const weight = sub(out) / baseSub
      if (weight > 2 || pitch < 0.8)
        bass.push(
          `${where} (${pitch.toFixed(2)}× pitch, ${weight.toFixed(2)}× sub)`,
        )
      console.log(
        `  ${pad(name, 6)}${pad(label, 11)}${num(change)}  ${num(pitch)}×  ${num(weight)}×`,
      )
    }
  }
}

// The two lists worth reading on their own. A silent wire is not a bug — a
// sixteen-step song has no A4 for you to find, and the bottom of a phase bus
// moves the wave by a fraction of a step — but it is what the panel's row of
// named cuts must never point at.
console.log(`\n${silent.length} combinations changed nothing:`)
for (const line of silent) console.log(`  ${line}`)
console.log(`\n${bass.length} went down rather than up:`)
for (const line of bass) console.log(`  ${line}`)

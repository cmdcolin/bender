// A board mid-session: a song chosen, a pattern written, levels set by hand —
// and the reading of it that says what is yours rather than the circuit's.
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { GRID_ROWS } from '../../drums'
import { romIndex } from '../../dsp/stages/roms'

export const mine = (): Controls => ({
  ...DEFAULT_CONTROLS,
  chipTune: romIndex('sakura'),
  drumKick: 0b1010_0000_1010_0000,
  drumClap: 0b0000_1000_0000_1000,
  drumAccent: 0b1000_0000_0000_0000,
  outGain: -6,
  micLevel: 1.4,
  sampleLevel: 0.7,
})

export const yours = (c: Controls) => [
  c.chipTune,
  ...GRID_ROWS.map(r => c[r.key]),
  c.outGain,
  c.micLevel,
  c.sampleLevel,
]

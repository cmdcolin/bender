import { ROM_ADDR_LINES } from '../dsp/stages/roms.ts'
import { sliderFor } from './controls/index.ts'

import type { ControlKey } from '../controls.ts'

// Each bus a knife can reach, one trace a bit with the lowest on top. The
// drawing reads the knifed trace and its fault off the board.

export interface Ribbon {
  line: ControlKey
  fault: ControlKey
}

type Pin =
  | { link: number; line: number }
  | { chip: number; pin: string; line?: undefined }

// A wire soldered from one trace onto another trace or onto a chip's pin.
export interface Tap {
  /** 0 is no wire; n leaves from trace n − 1 of the link's last ribbon. */
  key: ControlKey
  also?: ControlKey
  link: number
  onto: (also: number) => Pin
  /** The label on the wire, whatever the knobs say. */
  name: string
  /** The wire's tooltip: what the knobs make it do. */
  says: (value: number, also: number) => string
}

// A wire into the top of a chip, from above the drawing or out of another chip
// or ribbon. Set `always` to draw the wire with its knob at zero.
export interface Feed {
  key: ControlKey
  chip: number
  from?: { chip: number } | { link: number }
  always?: boolean
  name: string
  says: (value: number) => string
}

// A wire from off the chip soldered across the lowest `value` traces of the
// link's first ribbon.
export interface Inject {
  key: ControlKey
  link: number
  name: string
  says: (value: number) => string
}

export interface BusRow {
  /** A stack in a column puts one chip beside each ribbon of the link after it. */
  chips: (string | string[])[]
  links: Ribbon[][]
  taps?: Tap[]
  feeds?: Feed[]
  injects?: Inject[]
}

export interface BusSpec {
  label: string
  cut: ControlKey
  rows: BusRow[]
}

export const choice = (key: ControlKey, value: number) =>
  sliderFor(key).choices![Math.round(value)]!

const ribbon = (line: ControlKey, fault: ControlKey): Ribbon => ({
  line,
  fault,
})

export const BUS_SPECS: Record<string, BusSpec> = {
  'Plinky|knife on the bus': {
    label: 'plinky bus wiring',
    cut: 'chipBusCut',
    rows: [
      {
        chips: [['song select', 'counter'], 'ROM', 'note table', 'divider'],
        links: [
          [
            ribbon('chipBankLine', 'chipBankFault'),
            ribbon('chipAddrLine', 'chipAddrFault'),
          ],
          [ribbon('chipDataLine', 'chipDataFault')],
          [ribbon('chipDivLine', 'chipDivFault')],
        ],
        taps: [
          {
            key: 'chipLoopFrom',
            also: 'chipLoopTo',
            link: 1,
            onto: to =>
              to < ROM_ADDR_LINES
                ? { link: 0, line: to }
                : { chip: 0, pin: 'reset' },
            name: 'loop wire',
            says: (from, to) =>
              `loop wire ${choice('chipLoopFrom', from)} → ${choice('chipLoopTo', to)}`,
          },
        ],
      },
    ],
  },
  'Clatter|knife on the bus': {
    label: 'drum machine bus wiring',
    cut: 'drumBusCut',
    rows: [
      {
        chips: ['counter', 'pattern memory', 'voices'],
        links: [
          [ribbon('drumAddrLine', 'drumAddrFault')],
          [ribbon('drumDataLine', 'drumDataFault')],
        ],
        taps: [
          {
            key: 'drumReset',
            link: 1,
            onto: () => ({ chip: 0, pin: 'clear' }),
            name: 'reset',
            says: v => `reset ${choice('drumReset', v)}`,
          },
        ],
        feeds: [
          {
            key: 'drumSlip',
            chip: 0,
            always: true,
            name: 'clock',
            says: v => (v > 0 ? 'clock slips' : 'clock'),
          },
          {
            key: 'drumLoop',
            chip: 1,
            from: { link: 1 },
            name: 'loop',
            says: v => `loop ${choice('drumLoop', v)}`,
          },
        ],
      },
    ],
  },
  'Clatter|Sample ROM': {
    label: 'drum sample ROM bus wiring',
    cut: 'drumBusCut',
    rows: [
      {
        chips: ['voice counters', 'sample ROM', 'DAC'],
        links: [
          [ribbon('drumRomAddrLine', 'drumRomAddrFault')],
          [ribbon('drumRomDataLine', 'drumRomDataFault')],
        ],
      },
    ],
  },
  'Parlor|knife on the bus': {
    label: 'parlor bus wiring',
    cut: 'pcmBusCut',
    rows: [
      {
        chips: ['counter', 'sample ROM', 'DAC'],
        links: [
          [ribbon('pcmAddrLine', 'pcmAddrFault')],
          [ribbon('pcmDataLine', 'pcmDataFault')],
        ],
      },
    ],
  },
  'Glint|knife on the bus': {
    label: 'glint bus wiring',
    cut: 'fmBusCut',
    rows: [
      {
        chips: ['processor', 'register file'],
        links: [
          [
            ribbon('fmDataLine', 'fmDataFault'),
            ribbon('fmAddrLine', 'fmAddrFault'),
          ],
        ],
        feeds: [
          {
            key: 'fmStrobe',
            chip: 1,
            from: { chip: 0 },
            always: true,
            name: 'strobe',
            says: v => (v > 0 ? 'strobe slips' : 'strobe'),
          },
        ],
        injects: [
          {
            key: 'fmToyBus',
            link: 0,
            name: 'toy out',
            says: v => `toy out on D0–D${v - 1}`,
          },
        ],
      },
      {
        chips: ['instrument', 'patch table', 'operators'],
        links: [
          [ribbon('fmPatchLine', 'fmPatchFault')],
          [ribbon('fmPatchDataLine', 'fmPatchDataFault')],
        ],
      },
      {
        chips: ['phase', 'sine table', 'output'],
        links: [
          [ribbon('fmWaveLine', 'fmWaveFault')],
          [ribbon('fmWaveDataLine', 'fmWaveDataFault')],
        ],
      },
    ],
  },
}

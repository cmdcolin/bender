import { asEvent, EVENT, EVENT_KEYS } from '../../drums.ts'
import { MIC } from '../../dsp/micJacks.ts'
import { DEST } from '../../dsp/modbus.ts'
import { SUPPLY, SUPPLY_KEYS, SUPPLY_NAMES } from '../../dsp/supplies.ts'

import type { ControlKey, Controls } from '../../controls.ts'
import type { Group, SliderDef } from './types.ts'

export type SupplyKey = (typeof SUPPLY_KEYS)[number]

/** Each machine's Supply selector, and the machine it belongs to. */
export const SUPPLY_OF: Record<SupplyKey, string> = {
  chipSupply: 'Plinky',
  drumSupply: 'Clatter',
  fmSupply: 'Glint',
  pcmSupply: 'Parlor',
  monoSupply: 'Growler',
}

/** The machines a supply feeds, in panel order. */
export const machinesOn = (c: Controls, supply: number) =>
  SUPPLY_KEYS.filter(k => Math.round(c[k]) === supply).map(k => SUPPLY_OF[k])

const onShared = (c: Controls, key: SupplyKey | 'distSupply') =>
  Math.round(c[key]) === SUPPLY.shared

const kitFaults = (c: Controls) =>
  [...EVENT_KEYS, 'drumEventLive' as const].some(k => {
    const e = asEvent(c[k])
    return e === EVENT.drop || e === EVENT.reboot
  })

interface RailLoad {
  name: string
  keys: readonly ControlKey[]
  on: (c: Controls) => boolean
}

const RAIL_LOADS: readonly RailLoad[] = [
  {
    name: 'Clatter’s trigger load',
    keys: ['drumTrigLoad'],
    on: c => c.drumTrigLoad > 0 && c.drumLevel > 0 && onShared(c, 'drumSupply'),
  },
  {
    name: 'the kit’s drop and reboot steps',
    keys: [...EVENT_KEYS, 'drumEventLive'],
    on: kitFaults,
  },
  {
    name: 'the Clipper amp',
    keys: ['distMix'],
    on: c => c.distMix > 0 && onShared(c, 'distSupply'),
  },
  { name: 'Wear’s coupling', keys: ['couple'], on: c => c.couple > 0 },
  { name: 'Wear’s heat', keys: ['heatAmt'], on: c => c.heatAmt > 0 },
  {
    name: 'the mic on the rail',
    keys: ['micLevel'],
    on: c => c.micLevel > 0 && Math.round(c.micPatch) === MIC.toyRail,
  },
  {
    name: 'the feedback bus',
    keys: ['fbAmt', 'fb2Amt', 'fb3Amt'],
    on: c =>
      Math.round(c.fbDest) === 2 &&
      (c.fbAmt > 0 || c.fb2Amt > 0 || c.fb3Amt > 0),
  },
  {
    name: 'a patch bay wire on Starve',
    keys: [],
    on: c =>
      ([0, 1, 2, 3] as const).some(
        i =>
          Math.round(c[`mod${i}Src`]) !== 0 &&
          c[`mod${i}Depth`] !== 0 &&
          Math.round(c[`mod${i}Dest`]) === DEST.starve,
      ),
  },
]

/** What outside the Power supply panel is sagging the shared cells. */
export const sharedLoads = (c: Controls): string[] =>
  RAIL_LOADS.filter(l => l.on(c)).map(l => l.name)

/** Knobs whose only job is to load the shared cells; a blind roll leaves them off. */
export const RAIL_KNOBS = ['drumTrigLoad', 'couple', 'heatAmt'] as const

/** Whether this control is, right now, one of the loads on the shared cells. */
export const sagsSharedCells = (c: Controls, key: ControlKey) =>
  RAIL_LOADS.some(l => l.keys.includes(key) && l.on(c))

const onSecond = (c: Controls) =>
  machinesOn(c, SUPPLY.second).length > 0 ||
  (c.distMix > 0 && Math.round(c.distSupply) === SUPPLY.second)

export const supplyRow = (key: SupplyKey): SliderDef => ({
  key,
  label: 'Supply',
  min: 0,
  max: SUPPLY_NAMES.length - 1,
  step: 1,
  unit: '',
  choices: SUPPLY_NAMES,
  menu: true,
  help: `Which supply ${SUPPLY_OF[key]} runs off. The shared cells bend every machine on them together. Second cells have their own knobs in Power supply and their own reboots. The bench supply never sags.`,
})

// The battery rail the toy keyboard, drums, FM chip, home keyboard and mono
// synth boot on, and the second set of cells any of them can move to.
export const SUPPLY_GROUPS: Group[] = [
  {
    name: 'Power supply',
    place: 'Sources',
    editor: { kind: 'supply' },
    folded: ['the reset chip', 'the clip'],
    sliders: [
      {
        key: 'chipStarve',
        lane: 'starve',
        part: 'the cells',
        label: 'Starve',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        shy: true,
        help: 'Sags the shared cells. Pitch dives, notes collapse, and past the brownout threshold the watchdog reboots the chip. One oscillator clocks the whole chip, so a sag that lasts slurs and slows the tune together, the way a tape does.',
      },
      {
        key: 'chipBattery',
        part: 'the cells',
        label: 'Batteries',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        shy: true,
        help: 'How flat the cells are. The rail never comes back to full, so the toy runs low and slow — pitch, tempo and the drum machine with it — and every note sags it further with nothing starving it. Far enough down and a chord alone browns the chip out.',
      },
      {
        key: 'chipLeadR',
        part: 'the cells',
        label: 'Lead resistance',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        help: 'A resistor in series with the cells: the rail still rests where it always rested, but every note has to pull its supply through the resistor to get there. So it sags on the attack and climbs back between hits — a toy that whoops on every note rather than one running out.',
      },
      {
        key: 'gndBounce',
        lane: 'ground bounce',
        part: 'the cells',
        label: 'Ground bounce',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        shy: true,
        help: 'Thins the ground trace every machine returns through. Each loud attack lifts the ground under the logic, and a lift past a chip’s threshold reads as an extra clock edge: Plinky’s tune jumps ahead a note and Clatter’s counter takes an extra step. Clatter trips first. A loud hit that fires the next step early can fire the one after it too, so loud patterns stumble forward. Quiet playing leaves both counters alone.',
      },
      {
        key: 'chipCap',
        part: 'the cells',
        label: 'Reservoir',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        help: 'How much of the board’s capacitance sits behind whatever the starve is pulling on. It moves no voltage; it sets how long the rail takes to get there. At zero starve is a step you land on; wound up you hear the whole dive, slowing as it goes.',
      },
      {
        key: 'chipWatchdog',
        label: 'Watchdog',
        part: 'the reset chip',
        min: 0.2,
        max: 0.6,
        step: 0.005,
        unit: 'V',
        help: 'The voltage at which the reset chip treats the supply as failed. At the bottom the reboot is the last thing to happen on the way down and you hear the whole dive first; at the top the toy resets while it could still run, so the tune just restarts.',
      },
      {
        key: 'chipLatch',
        part: 'the reset chip',
        label: 'Latch-up',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        shy: true,
        help: 'How often a brownout jams the chip instead of rebooting it. A latched CMOS die holds whatever note was sounding and keeps drawing current, so it screams one note until the rail collapses and the watchdog power-cycles it.',
      },
      {
        key: 'chipLatchHold',
        label: 'Latch hold',
        part: 'the reset chip',
        min: 0.01,
        max: 0.19,
        step: 0.005,
        unit: 'V',
        help: 'Where a jammed die and its supply come to rest against each other — a latch needs some rail left to hold itself in, which is why the note screams instead of stopping. Low is a growl under the floor, high a shriek that nearly makes a note.',
      },
      {
        key: 'chipClipHz',
        part: 'the clip',
        label: 'Clip chatter',
        min: 0,
        max: 40,
        step: 0.1,
        unit: 'Hz',
        help: 'Bare metal dragged across the pads, and how often it finds one. Each touch chokes hard for a few tens of milliseconds and lets go at whatever rate the Reservoir allows — the dive that repeats without you doing anything.',
      },
      {
        key: 'chipClipClock',
        needs: c => c.chipClipHz > 0,
        part: 'the clip',
        label: 'Clip on clock',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        help: 'Whether the clip lands on the timing pin, which gives a dive, or on the supply, which gives a sag. Starving the rail is worth two thirds of an octave; dividing the clock has no such ceiling — four at the top, whole timebase with it. Needs Clip chatter.',
      },
      {
        key: 'chipClipBite',
        label: 'Clip bite',
        part: 'the clip',
        min: 0,
        max: 4,
        step: 0.05,
        unit: '',
        shy: true,
        help: 'How hard bare metal chokes the supply when it lands. Low is a lean on the pitch; high is a full brownout on every touch. Crank it and each contact trips the watchdog, so Clip chatter reboots the chip.',
      },
      {
        key: 'chipClipHold',
        label: 'Clip dwell',
        part: 'the clip',
        min: 3,
        max: 800,
        step: 1,
        unit: 'ms',
        curve: 'log',
        help: 'How long one touch lasts on average, never twice the same. Short, the rail has not finished leaving before the metal lifts, so you get the top of the dive over and over; long, every touch arrives at the bottom and sits there.',
      },
      {
        key: 'chipClipCharge',
        label: 'Clip charge',
        part: 'the clip',
        min: 2,
        max: 400,
        step: 1,
        unit: '/s',
        curve: 'log',
        help: 'How fast the cap the clip found charges through the contact — the rate the clock leaves at while the metal is down. This is the dive itself: slow is a swoop you hear travel, fast is a step you land on. The Reservoir slows it further, so the two multiply.',
      },
      {
        key: 'chipClipRelease',
        label: 'Clip release',
        part: 'the clip',
        min: 2,
        max: 2000,
        step: 1,
        unit: '/s',
        curve: 'log',
        help: 'How fast the clock comes back when the metal lifts, which disconnects the pin and stock runs ten times the charge rate. That asymmetry makes the bend a dive; even it up and dives turn into a warble.',
      },
      {
        key: 'cell2Starve',
        lane: 'second cells starve',
        part: 'second cells',
        needs: onSecond,
        label: 'Second starve',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        shy: true,
        help: 'Sags the second cells, and only the machines whose Supply is set to them. Past the brownout threshold their own watchdog reboots them and leaves everything on the shared cells playing.',
      },
      {
        key: 'cell2Battery',
        part: 'second cells',
        needs: onSecond,
        label: 'Second batteries',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        shy: true,
        help: 'How flat the second cells are. The machines on them run low and slow, and sag further on every note.',
      },
      {
        key: 'cell2Lead',
        part: 'second cells',
        needs: onSecond,
        label: 'Second lead',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        help: 'A resistor in series with the second cells. Their machines whoop on every note and climb back between hits.',
      },
      {
        key: 'cell2Cap',
        part: 'second cells',
        needs: onSecond,
        label: 'Second reservoir',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        help: 'The capacitance behind the second cells. It sets how long their rail takes to fall and recover, not where it lands.',
      },
      {
        key: 'cell2Clip',
        part: 'second cells',
        needs: onSecond,
        label: 'Second clip',
        min: 0,
        max: 40,
        step: 0.1,
        unit: 'Hz',
        help: 'A paperclip on the second cells’ pads, and how often it finds one. Each touch chokes their rail for a few tens of milliseconds, so the machines on them dive while the shared cells play clean.',
      },
      {
        key: 'cell2Latch',
        part: 'second cells',
        needs: onSecond,
        label: 'Second latch-up',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '',
        shy: true,
        help: 'How often a brownout on the second cells jams their machines instead of rebooting them: one note screams until the rail gives out.',
      },
    ],
  },
]

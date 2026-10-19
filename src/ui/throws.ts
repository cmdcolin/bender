import type { Controls } from '../controls.ts'

export interface ThrowDef {
  name: string
  key: string
  blurb: string
  push: (c: Controls) => Partial<Controls>
}

const atLeast = (v: number, floor: number) => Math.max(v, floor)

// Held, not set: each one springs back when you let go.
export const THROWS: ThrowDef[] = [
  {
    name: 'spin',
    key: 'c',
    blurb: 'Wraith feedback past 1',
    push: c => ({ dlyFb: 1.25, dlyMix: atLeast(c.dlyMix, 0.7), dlySend: 1 }),
  },
  {
    name: 'dive',
    key: 'v',
    blurb: 'Screech filter slammed shut',
    push: c => ({ filtMix: 1, filtHz: 160, filtRes: atLeast(c.filtRes, 0.9) }),
  },
  {
    name: 'brake',
    key: 'b',
    blurb: 'Wraith braked, toy clock dragged down',
    push: c => ({
      tapeBrake: 1,
      dlyMix: atLeast(c.dlyMix, 0.6),
      chipClipClock: 0.8,
    }),
  },
  {
    name: 'crash',
    key: 'n',
    blurb: 'Spring tank kicked',
    push: c => ({
      revKick: 1,
      revMix: atLeast(c.revMix, 0.6),
      revDecayS: atLeast(c.revDecayS, 4),
    }),
  },
  {
    name: 'drop',
    key: 'm',
    blurb: 'Kick out',
    push: () => ({ drumKick: 0, drumKickMaybe: 0 }),
  },
  {
    name: 'crush',
    key: ',',
    blurb: 'Crusher down to three bits',
    push: () => ({ bits: 3, crushMix: 1 }),
  },
]

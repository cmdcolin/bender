import type { Group } from './types'

export const FEEDBACK_GROUPS: Group[] = [
  {
    name: 'Feedback bus',
    place: 'Feedback',
    sliders: [
      {
        key: 'fbAmt',
        label: 'Amount',
        min: 0,
        max: 1.5,
        step: 0.01,
        unit: '',
        help: 'Output patched back into the source mix. With no input this is the whole no-input-mixer instrument.',
      },
      {
        key: 'fbDelayMs',
        label: 'Loop time',
        min: 0.05,
        max: 500,
        step: 0.05,
        unit: 'ms',
        curve: 'log',
        help: 'The loop’s own comb delay. Tiny values squeal at kHz; long values self-play the chain.',
      },
      {
        key: 'fbTone',
        label: 'Tilt',
        min: -1,
        max: 1,
        step: 0.01,
        unit: '',
        help: 'Darkens or brightens the loop — decides which register the squeal settles into.',
      },
      {
        key: 'fbDest',
        label: 'Patched into',
        min: 0,
        max: 3,
        step: 1,
        unit: '',
        choices: ['mix', 'osc FM', 'chip rail', 'delay'],
        help: 'Where the return wire is soldered: the source mix, oscillator A’s FM input (the loop plays the pitch), the toy supply rail (the output browns out its own toy), or straight into the tape.',
      },
    ],
  },
]

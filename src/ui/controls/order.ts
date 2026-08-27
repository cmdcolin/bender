import type { ControlKey } from '../../controls'
import { PEDAL_ORDER_NAMES, PEDAL_ORDERS } from '../../pedals'
import { BENDS, BEND_SLOT_KEYS } from './bends'
import type { Group } from './types'

// One door for both runs that are yours to order: the six positions the bends
// compete for, on their way from the mix bus to the pedals, and the four
// pedals waiting downstream of them. They sit off the path rather than on it,
// the way Wear does — ordering is a thing about the board rather than about
// any one stage, and it stays a single button whether you came to move a
// bend or a pedal.
export const ORDER_GROUPS: Group[] = [
  {
    name: 'Signal order',
    place: 'Master',
    // OrderRack draws both racks — SlotRack under 'onboard effects', PedalRack
    // under 'pedals' — which between them are the whole of the panel, so a
    // second copy as dropdowns underneath would be one way in too many.
    editor: { kind: 'order' },
    handled: [...BEND_SLOT_KEYS, 'pedalOrder'],
    // The rigs filed under this group only ever set the bend slots, so a rig
    // demonstrating two bends in order clears just those — not a pedal order
    // it never mentions. The panel's own reset and roll still reach both.
    clearScope: BEND_SLOT_KEYS,
    sliders: [
      ...BEND_SLOT_KEYS.map((key, i) => ({
        key,
        label: `Position ${i + 1}`,
        min: 0,
        max: BENDS.length,
        step: 1,
        unit: '',
        choices: ['—', ...BENDS.map(b => b.label)],
        help: 'Which bend runs in this position. The signal walks the positions top to bottom on its way from the mix bus to the pedals, and a bend named twice runs only at the first one. The pedals downstream order themselves too, but they are not this: four boxes that are always all on the board, where these are six sockets seven bends compete for.',
      })),
      {
        key: 'pedalOrder' as ControlKey,
        label: 'Order',
        min: 0,
        max: PEDAL_ORDERS.length - 1,
        step: 1,
        unit: '',
        choices: PEDAL_ORDER_NAMES,
        help: 'What order the signal meets the four pedals in. It matters most where one of them is loud: fuzz into a reverb is a wall with a room behind it, and a reverb into fuzz is the room itself distorting. Unlike the bends upstream, all four are always on the board — a pedal comes out of the path on its own mix, not by leaving the order.',
      },
    ],
  },
]

import type { ControlKey, Controls } from '../../controls'

export interface SliderDef {
  key: ControlKey
  label: string
  min: number
  max: number
  step: number
  unit: string
  help: string
  choices?: string[]
  curve?: 'log'
  /** What the control is to the stage, where that outlives its name: a mix is
      the stage's dry/wet, a level is the whole of whether it is there at all.
      A roll reads this to decide what it must leave audible. */
  role?: 'mix' | 'level'
  /** Covers the board rather than joining it, so a roll brings it on rarely and
      low. Your hand still puts it wherever you want it, and a preset that names
      it still gets it when you pick that preset by name. */
  shy?: true
  /** The heading this control sits under, where a panel has grown long enough
      that one flat list stops being a list of anything. Controls naming none sit
      above the first heading, which is where a stage's everyday knobs belong. */
  part?: string
  /** Whether the control has anything to act on yet. A fault picks what happened
      to a wire nobody has cut, so the row waits until there is a wire — unless
      your hand has already moved it, because a control you have set is a control
      you get to see. */
  needs?: (c: Controls) => boolean
  /** What the readout says, where the number alone is not what the control
      means. A speed of −2 is not two less than something — it is twice as fast
      the other way, and a knob whose left half is reverse rather than slow has
      to say so where you are looking. */
  reads?: (value: number) => string
  /** A travel whose two halves are different things rather than more and less
      of one thing. The row paints each half in its own colour, marks the turn
      between them, and fills the throw out from the turn rather than up from
      the bottom, so a knob a hair the wrong side of the middle reads as the
      wrong side rather than as nearly nothing. */
  split?: {
    at: number
    /** The two directions and the turn, named under the track. A stage's one
        headline travel earns the line; a panel of split rows would spend more
        height on captions than on knobs, so most take the paint alone. */
    names?: { below: string; above: string; mid: string }
    /** Whether the turn holds the knob as it passes. For a travel whose middle
        is a stop, yes: the values a hair either side are a tape going one way
        and a tape going the other, and a stop you can only hit by luck is a
        stop that isn't there. For one whose middle is merely centred — a bias
        you want a hair off — no. */
    detent?: true
  }
  /** A value the control has a reason to jump to that isn't a place on its own
      travel — it is worked out from the rest of the board. One press, drawn
      beside the readout. */
  action?: {
    label: string
    title: string
    value: (c: Controls, def: SliderDef) => number
  }
}

export const STAGE_ORDER = [
  'Sources',
  'Bends',
  'Pedals',
  'Patch',
  'Feedback',
  'Tape',
  'Master',
] as const
export type StagePlace = (typeof STAGE_ORDER)[number]

export interface Group {
  name: string
  place: StagePlace
  sliders: SliderDef[]
  /** A widget of the group's own, because a row of sliders is the wrong shape
      for what it turns: a plugboard for the kit, a desk for the mix bus. The
      kit's own controls have no slider anywhere and so are named here; the
      desk's are other groups' faders, which is what `borrows` is for. */
  editor?:
    | { kind: 'drums'; keys: ControlKey[] }
    | { kind: 'roll'; keys: ControlKey[] }
    | { kind: 'mixer' }
  /** Controls another group owns that this one counts, resets and rolls as its
      own, because they are about this one too. A fader belongs to its machine —
      it is the first knob on the FM chip's panel, where a hand reaching for the
      FM chip will find it — and it is also one of six on the desk they all meet
      at, which is the only place their balance against each other is a thing you
      can see. Whoever owns the key names it, and the board still has exactly one
      widget per control, because only one group is ever open.

      Not the same list as what the widget draws: the desk draws every fader
      that reaches the bus, and borrows the ones that are the board's rather
      than yours. */
  borrows?: readonly ControlKey[]
  /** Which of the group's headings open folded, so a long panel opens on the
      instrument and what you can do to it with a knife is one press away. A
      heading holding something you have moved opens anyway. */
  folded?: string[]
}

// Generates docs/features.md. `pnpm features` rewrites it; features.test.ts
// fails if the committed copy falls behind.
//
// An inventory hand-written is an inventory that drifts, and nothing about a
// list of every control on the board is worth keeping current by diligence. So
// the counts, the group names, the ranges and every set of choices come off the
// control tables themselves. What is written here is the part a table cannot
// say: what each group is for.
//
// Every control's own line comes off the tooltip the panel already shows for
// it, so the doc and the instrument say the same thing by construction.
//
// Adding a group without a line in BLURBS throws rather than quietly shipping a
// doc with a hole in it — which is the same reason the number of controls is
// counted rather than typed.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import { BENDS, BEND_SLOT_KEYS } from '../src/ui/controls/bends'
import { ALL_SLIDERS, CHANNELS, GROUPS } from '../src/ui/controls'
import type { Group, SliderDef } from '../src/ui/controls/types'
import { STAGE_ORDER } from '../src/ui/controls/types'
import { CUTS } from '../src/ui/presets/cuts'
import { RIGS } from '../src/ui/presets/rigs'
import { PRESETS } from '../src/ui/presets/table'
import { boardHash } from '../src/ui/share'
import { DEFAULT_CONTROLS } from '../src/controls'
import { ROMS } from '../src/dsp/stages/roms'
import { DRUM_VOICES, GRID_ROWS, STEPS } from '../src/drums'
import { PEDAL_ORDERS } from '../src/pedals'
import pkg from '../package.json' with { type: 'json' }

const BLURBS: Record<string, string> = {
  'Toy keyboard':
    'The instrument the whole thing is named after: a square-wave divider chip running a ROM, with a tone control that taps the divider at a different width, an auto bass-chord section and playable voices over the top. Its clock, counter, bias and gate are each a place to solder a pot onto — *Bend spot* picks which, *Bend pot* how far. Everything from *Starve* down is the supply underneath it.',
  'Toy drums':
    'A step grid with a length per row, so a five-step hat runs against a sixteen-step kick until they line back up. *Retrigger* hammers the current step at audio rate; *Cross-patch* leans one voice’s amplifier onto another’s envelope, so a hit you can hear opens a voice nothing struck. *Address line* and *Data line* knife the wires between the step counter and the pattern memory: the counter goes on counting, the grid goes on chasing it, and the machine plays somebody else’s pattern.',
  'FM chip':
    'The other synthesiser on the board: two operators a voice, four voices, on the same rail. It has no sequencer — its key input is soldered onto the toy’s gate line, so out of the box it plays whatever strikes a note over there, *Struck by* clips the kit’s trigger lines on beside it, and *Toy gate* cuts that jumper so it answers only the keybed screwed to its own board. That bed is drawn under the toy’s the moment the chip is up in the mix, with its own hold and octave, and the *keys* switch on either deck says which of the two the computer’s letter keys are wired to. It is not played but *configured*, a byte at a time over a bus, which is what *Data line* and *Address line* are for: a byte that lands wrong stays wrong until the processor writes that register again, and if the wire carrying the key back up cannot go low, the note never ends. *Wave line* is the other bus, the one the processor never touches — the sine is a table and a table is an address, so a knife there reshapes the wave under your hand and leaves nothing behind. *Effect* is the ROM’s other job: a bird, surf, wind, a siren or crickets, each a program spraying register writes rather than a sample, and the busiest thing the bus ever carries.',
  'Chaos osc':
    'Two oscillators on one starving supply. B drags A’s frequency around, the output current drains the rail, the rail drags pitch and amplitude, and the stall-and-recover cycle motorboats on its own.',
  'Noise & crackle':
    'Hiss with a colour control, and sparse crackle with a rate of its own.',
  Sampler:
    'A loaded audio file, looping through the chain — or, with *Struck by* on a voice and *Ending* on one-shot, a seventh drum voice playing whatever you dropped. The bay reaches its capstan and both loop markers, so a wire drags the reel’s pitch the way a starve drags the toy’s, or walks the loop window around the recording while the head plays on.',
  Mic: 'A live microphone, and the one source that does not have to reach the mix. *Mic patch* is the whole of it: the wire can land on the chip’s supply rail instead, or the oscillator’s FM input, the delay’s feedback, the ring modulator’s carrier or a trigger line — so a shout browns the toy out or fires the kit rather than simply being loud.',
  'Mix bus':
    'The desk the six sources meet at, and the only place their balance against each other is a thing you can see. Every fader is drawn here as well as on its own machine’s panel, under the machine’s name, with a meter beside it reading what that channel is putting on the bus and the bus’s own meter under the lot. A fader says how far it is up, not whether anything is coming out — the FM chip is the reason: it boots at zero, and turned up with nothing striking it — no hand on its keys, no tune next door — it is three quarters and silence. *Bus drive* is the summing amp: a wire at unity, and the one saturation ahead of the bends.',
  'Ring mod': 'Amplitude modulation by a carrier, sine or square.',
  Crusher:
    'Bit depth and sample rate, both down far enough to fall apart, with jitter on the rate.',
  Clipper:
    'A rack of clipping circuits, with bias, a tone control and a sub octave.',
  Comb: 'A tuned delay with feedback past unity — a pitch you can drive into oscillation.',
  'Screech filter':
    'Resonant filter with drive, taken past self-oscillation so it screams on its own.',
  'Glitch buffer':
    'Catches slices and repeats them, sometimes reversed, sometimes transposed, sometimes held.',
  'Freq shifter':
    'Bode-style: every partial moves by the same number of Hz rather than the same ratio, so harmonic input comes out inharmonic. With feedback each lap shifts again and partials climb forever.',
  'Signal order':
    'One door for both runs that are yours to order — the six positions the bends compete for, on their way from the mix bus to the pedals, and the four pedals waiting downstream of them. Two sections, drawn as two racks: *onboard effects* first, then *pedals*. Drag a box to move it, or take it with the arrow keys; drag or press a bend riding off the board, in the first section, to bring it in. Order is most of what a chain of effects sounds like: a crusher into a filter and a filter into a crusher are the same two stages and two different sounds, and fuzz into a reverb is a wall with a room behind it where a reverb into fuzz is the room itself distorting. Seven bends for six positions, so one always sits out; the four pedals never do — a pedal leaves the path on its own mix instead.',
  Stompbox:
    'Each circuit is its own model rather than one circuit with a knob on it. *Screamer* clips inside the feedback loop so the dry note walks under it; *rat* clips to ground behind a slew-limited op-amp; *muff* is two clipping stages and a scooped tone stack; *germanium* is the lopsided one, riding its bias down on the signal; *octave* rectifies into a ringing transformer; *gate* is misbiased to the edge of cutoff.',
  'Tape delay':
    'The capstan is a real motor: it has weight, it answers the brake slowly, and *Supply drag* wires it to the same dying rail as the toy, so the repeats dive in pitch as the board browns out.',
  'Delay pedal':
    'The normal box on a board of abused ones, and the one thing here that behaves. *Standard* moves its time by crossing between two read heads rather than dragging one, so the repeats already in the buffer keep their pitch while your hand is on the knob — the whole difference between this and the tape machine next to it. *Analog* is a bucket brigade whose clock sets the delay and the bandwidth together, so long is muddy by construction and the compander breathes behind the repeats. *Reverse* plays each window backwards, relocking at the seam.',
  'Spring verb':
    'Dispersive allpass cascade into short parallel combs — metallic, boingy, deliberately cheap.',
  'Patch bay':
    'Wires, each from a source to a destination at a signed depth. A wire can land on the toy’s supply rail, on the sampler’s capstan and loop markers, or on another wire’s depth — which is how the bay modulates itself.',
  'Trigger patch':
    'The two boxes’ trigger lines, bridged. The kit can play the keys and the keys can play the kit.',
  'Body contact': 'Two axes, for the hand on the circuit.',
  'Feedback bus':
    'The output fed back in, at a loop time short enough for kHz mixer squeal. *Patched into* decides where the return lands.',
  'Tape machine':
    'The whole instrument printed to tape, after everything else. Speed moves gap loss, head bump, hiss, wow rate and print-through together, because on a real machine they are one thing.',
  Brownout: 'The mains supply failing: sag, dropouts, crackle and hum.',
  Output: 'Gain, ahead of a dc block, soft clip and limiter that always run.',
  'Board parts':
    'What the toy board is made of, rather than what you are doing to it. Every one of these was a number compiled into the model until somebody wanted the other value, and every default is the one that shipped, so a board nobody has been at here is the stock board. *Timing pin* decides which sags the tempo notices. *Watchdog* is where the reset chip gives up, and it cannot sit under the voltage the die gives up at. *Latch hold* is what a jam sounds like. The four *Clip* knobs are the paperclip itself: how hard it bites, how long it stays, and the charge and release that make a dive a dive rather than a warble. *Clock drag* is how deep the cap on the oscillator can divide. *Part spread* is how far apart the four output stages came out of the bin — whether a chord collapses raggedly or all at once.',
  Wear: 'The slow ones, and the board-wide ones. *Heat* builds with what the board is dissipating and takes the rail down with it. *Fault clustering* redistributes every fault on the board from a flat rate into bursts. *Cross-coupling* is how much the brightness bus feeds back into the supply. *Dry joints* drops the bend on a slot out of the path mid-note — a click on the way out, another on the way back, and whatever it was ringing left mid-ring. *Re-solder* swaps two slots outright while you play, or moves the feedback return to a different pin, so the order changes with nobody’s hand on it. Neither of the last two writes to a control — the settings stay exactly where you left them and the path moves underneath — so the rack on the Signal order panel is where you watch it happen.',
}

const SCRIPTS: Record<string, string> = {
  dev: 'the app',
  build: 'typecheck and bundle',
  test: 'the suite: the DSP torture test that pins every feedback past unity at once, and the panel in jsdom',
  typecheck: 'types only',
  bench: 'what the chain costs per block, stage by stage',
  blocks:
    'the distribution — p50 to p99.9, and how many blocks went over budget',
  cold: 'the first seconds, before anything has tiered up',
  ab: 'this tree against a git ref, as a paired comparison',
  soak: 'whether any stage gets slower the longer it runs',
  diagram: "re-renders the README's signal path",
  features: 'rewrites docs/features.md — this file',
  figure: "re-shoots the README's screenshot of the app and its panel",
  knife:
    'sweeps every wire and fault on every bus and reports which you can hear',
  spectrum:
    'sweeps the same space and reports what each fault sounds like, by frequency',
  preview: 'serves the built bundle',
  format: 'prettier',
  prepare: 'points git at .githooks',
  pat: 'release: patch',
  min: 'release: minor',
  maj: 'release: major',
}

const LIVE = 'https://cmdcolin.github.io/bender/'

// A preset as a link, written by the same function the address bar is written
// with — so what the doc hands somebody is a board, not a screenshot of one.
//
// In the long form, which is what the `#set=` asks for. The bar defaults to the
// short one because a link that has to survive a chat window wants to be short,
// and a doc is the other case entirely: the point of the line is which controls
// the preset moves and where it puts them, which `#p=AIwBL6ABWugCAKoBAsgBLBIBqgE`
// does not say.
const presetUrl = (patch: Partial<typeof DEFAULT_CONTROLS>) =>
  `${LIVE}#${boardHash('#set=', { ...DEFAULT_CONTROLS, ...patch })}`

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const num = (n: number) => {
  const words = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
  ]
  return words[n] ?? String(n)
}

const n = (v: number) => String(Number(v.toFixed(4)))
const sign = (v: number, signed: boolean) =>
  v < 0 ? `−${n(-v)}` : signed && v > 0 ? `+${n(v)}` : n(v)

// Hz and ms are the two that run over three orders of magnitude, and 48000 Hz
// is a number you have to count the digits of.
const scale = (v: number, unit: string) => {
  if (unit === 'Hz' && Math.abs(v) >= 1000) return { v: v / 1000, unit: 'kHz' }
  if (unit === 'ms' && Math.abs(v) >= 1000) return { v: v / 1000, unit: 's' }
  return { v, unit }
}

const SPELLED: Record<string, string> = {
  '/s': 'per second',
  oct: 'octaves',
  bit: 'bits',
}

// Ranges in the words the panel would use, rather than two numbers with a dash
// between them: '0–1' says nothing that 'off to full' doesn't, and '-1–1' has
// to be read twice.
function range(s: SliderDef): string {
  if (s.choices)
    return s.choices.length === 2
      ? s.choices.join(' or ')
      : s.choices.join(', ')
  const { min, max, unit } = s
  const signed = min < 0
  const to = (a: string, b: string) => `${a} to ${b}`
  // A control that prints its own readout prints its own ends too. The rules
  // below read a number as an amount of something, which is exactly what those
  // controls have a readout of their own to say they are not.
  if (s.reads) return to(s.reads(min), s.reads(max))
  if (!unit) {
    if (min === 0 && max === 1) return 'off to full'
    return to(sign(min, false), sign(max, signed))
  }
  if (unit === '×') return to(`${sign(min, false)}×`, `${sign(max, signed)}×`)
  if (SPELLED[unit])
    return `${to(sign(min, false), sign(max, signed))} ${SPELLED[unit]}`
  const lo = scale(min, unit)
  const hi = scale(max, unit)
  return lo.unit === hi.unit
    ? `${to(sign(lo.v, false), sign(hi.v, signed))} ${hi.unit}`
    : to(`${sign(lo.v, false)} ${lo.unit}`, `${sign(hi.v, signed)} ${hi.unit}`)
}

// The panel already says what every control is, in its tooltip. The doc says
// the first sentence of it, and where that sentence is a long one with a list
// after the colon, only the half before — the range column is the list.
function gloss(s: SliderDef): string {
  const [first = s.help] = s.help.split(/(?<=[.?!])\s+/)
  const trimmed = first.replace(/\.$/, '')
  if (trimmed.length <= 130) return trimmed
  const clause = trimmed.search(/[:—;]/)
  return clause > 0 && clause < 120 ? trimmed.slice(0, clause).trim() : trimmed
}

// A group with four identical wires on it prints one wire and says so. The
// labels carry the only difference, so 'Wire 1 from' through 'Wire 4 from'
// come back as one row named 'Wire 1–4 from'.
function rows(sliders: SliderDef[]): string[] {
  const merged = new Map<string, { label: string; nums: number[] }>()
  for (const s of sliders) {
    const key = `${s.label.replace(/\d+/g, '#')}|${range(s)}|${gloss(s)}|${s.shy}`
    const at = merged.get(key)
    const idx = Number(s.label.match(/\d+/)?.[0])
    if (at) at.nums.push(idx)
    else merged.set(key, { label: s.label, nums: [idx] })
  }
  return [...merged.values()].map(({ label, nums }) => {
    const [first] = nums
    const last = nums[nums.length - 1]
    const name =
      nums.length > 1 ? label.replace(/\d+/, `${first}–${last}`) : label
    const s = sliders.find(x => x.label === label)!
    return `| ${name}${s.shy ? ' †' : ''} | ${range(s)} | ${gloss(s)} |`
  })
}

// The blurbs are the part worth reading straight through; the tables are the
// part you go looking for. Folded, a stage is a screen of prose with its
// inventory one click under it — and prettier still formats a table in here,
// because the blank lines keep it a markdown block of its own.
const fold = (summary: string, body: string) =>
  `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`

// A group whose widget is not a row of sliders says so above the fold, because
// the table below cannot: the pattern is sixteen bits and a length per row, and
// counting only the sliders leaves the loudest half of the drum machine off the
// inventory entirely. The desk has the opposite problem — every fader on it is
// already counted, under the machine it belongs to.
function grid(g: Group): string {
  if (g.editor?.kind === 'mixer')
    return `\nThe desk is a widget rather than a row of sliders, and its ${num(CHANNELS.length)} faders
are counted under the machines they belong to: each is the first knob on that
machine's panel and one strip of this one.\n`
  if (g.editor?.kind === 'order')
    return `\nTwo racks, not a row of sliders: the ${num(BEND_SLOT_KEYS.length)} bend-slot controls under
*onboard effects*, and the one order control under *pedals* — ${num(PEDAL_ORDERS.length)} orders rather
than a socket per pedal, so a roll, a link and a preset all reach it and none
of them can leave it saying something that is not an order. Both racks draw
their own controls, so the panel does not draw either a second time as
dropdowns. Order is only half of what the onboard-effects run is: a bend can
sit in a position and still be inaudible, either because its own dry/wet is at
zero or because it already ran higher up, and the row it is on says which. The
rows also read back what *Solder* is doing to the path while you play — a
position the relay has moved says where the board is running it, and one whose
joint has opened says it is out of the path altogether. Neither of those is a
control, so this is the only place either of them can be seen. The pedal rows
have no equivalent to read back: all four are always on the board.\n`
  if (g.editor?.kind !== 'drums') return ''
  const n = g.editor.keys.length
  return `\nThe pattern grid is a widget rather than a row of sliders, so the table
below leaves it out: ${num(GRID_ROWS.length)} rows (the ${num(DRUM_VOICES.length)} voices and an accent), each
carrying ${STEPS} steps and a length of its own, and a second ${STEPS}-step mask on every
voice for the steps that only sometimes fire. That is ${n} more controls, and they
ride in a link like the rest.\n`
}

// The knives the panel offers on this group's buses by name. A bus fault is
// three controls that only mean anything together and most of the combinations
// are a wire you can cut and hear nothing, so the panel keeps a row of the ones
// worth hearing — and the doc lists the same row, off the same table.
function cuts(g: Group): string {
  const mine = CUTS.filter(c => c.group === g.name)
  const [first] = mine
  if (!first) return ''
  const lines = mine.map(c => `- **${c.name}**: ${c.blurb}`).join('\n')
  return `\nNamed cuts, one press each under *${first.part}*, where the panel
keeps them too — the knife goes on and the rows under it say which controls
that was:\n\n${lines}\n`
}

// A stage that only says anything with every knob on it pointing the same way
// keeps a row of whole settings, the way a bus keeps a row of cuts.
function rigs(g: Group): string {
  const mine = RIGS.filter(r => r.group === g.name)
  if (mine.length === 0) return ''
  const lines = mine.map(r => `- **${r.name}**: ${r.blurb}`).join('\n')
  return `\nNamed settings, one press each at the head of the panel — the stage
goes back to stock and the setting is written over it, so the rows underneath
say what it became:\n\n${lines}\n`
}

function groupSection(g: Group): string {
  const blurb = BLURBS[g.name]
  if (!blurb) {
    throw new Error(
      `no blurb for control group '${g.name}' — add one to BLURBS in scripts/features.ts`,
    )
  }
  const table = rows(g.sliders).join('\n')
  // The doc tells people a roll leaves the shy ones alone, so it had better say
  // which those are.
  return `### ${g.name}\n\n${blurb}\n${grid(g)}${rigs(g)}${cuts(g)}\n${fold(
    `${g.sliders.length} control${g.sliders.length === 1 ? '' : 's'}`,
    `| control | range | what it does |\n| --- | --- | --- |\n${table}`,
  )}\n`
}

// Formatted here rather than left for `pnpm format`, so the committed file is
// what this returns and the drift test compares like with like.
export async function renderFeatures(): Promise<string> {
  const cfg = await resolveConfig(
    new URL('../.prettierrc.json', import.meta.url).pathname,
  )
  return format(build(), { ...cfg, parser: 'markdown' })
}

function build(): string {
  const byPlace = new Map(STAGE_ORDER.map(p => [p, [] as Group[]]))
  for (const g of GROUPS) byPlace.get(g.place)!.push(g)
  const sliders = GROUPS.flatMap(g => g.sliders)

  const out: string[] = []
  const slots = BEND_SLOT_KEYS.length
  const wires = GROUPS.find(g => g.name === 'Patch bay')!
  const dests = wires.sliders.find(s => s.label.endsWith('to'))!.choices!.length

  out.push(`<!-- Generated by \`pnpm features\`. Edit scripts/features.ts, not this file. -->

# What is in the box

A virtual toy keyboard and drum machine, run on a supply rail you are allowed to
ruin. ${sliders.length} knobs and switches in ${GROUPS.length} groups, ${num(BENDS.length)} bends competing for ${num(slots)} slots,
${ROMS.length} ROM tunes, ${PRESETS.length} presets, ${RIGS.length} stage settings and ${CUTS.length} named cuts — and everything
below comes off
the control tables themselves, so the list cannot drift from the instrument.

Try it: **${LIVE}**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../img/chain-dark.svg">
  <img alt="The signal path: six sources sum into the mix bus, run through six reorderable bend slots and the pedals, then brownout, the tape machine and the output, with the feedback bus wired from the output back to the mix" src="../img/chain-light.svg" width="520">
</picture>

The panel draws that live as you play, from the chain itself — the bends appear
in whatever order you patched them and dead stages grey out. \`pnpm diagram\`
renders it with the same layout the app uses.

## The tour

- **Nothing here is a sample.** The reboots, the pitch dives and the screams
  fall out of the mechanisms. One RC oscillator clocks the whole toy chip, so
  pitch, tempo and envelopes are the same thing divided — starve the rail and
  they all go down together, and no setting pulls them apart.
- **Solder a pot onto the die.** *Bend spot* picks the clock, the counter, the
  bias or the gate; *Bend pot* is how far you turn it. *Clip chatter* is the
  paperclip: bare metal dragged across the pads, biting the supply a few times a
  second, each touch a dive the board has to climb back out of.
- **Put a knife through the bus.** Cut, ground, bridge or pull up a data or
  address line — on the toy, the drum machine or the FM chip — and the wrong
  byte lands; on the FM chip it *stays* wrong until the processor writes that
  register again. Which wire and what happened to it only mean anything
  together, so each chip's *knife on the bus* opens on a row of named cuts:
  press **machine-gun** or **the note never ends** and the rows under it say
  what that was. **Random knife** in the dice row draws from the same table.
- **${cap(num(BENDS.length))} bends, ${num(slots)} slots.** You pick which are on the board and in what
  order, so one always sits out. A mix at zero takes the stage out of the path
  rather than merely silencing it.
- **A patch bay that modulates itself.** ${cap(num(wires.sliders.filter(s => s.label.endsWith('depth')).length))} wires, ${dests} destinations — among them
  the supply rail, the sampler's capstan, and the other wires' own depths.
- **Feedback tight enough to squeal.** The whole chain runs inside one worklet
  \`process()\`, so the global loop is at audio rate and every feedback path
  saturates in-loop. Runaway is a feature; a fixed safety tail means no setting
  can blow up the output.
- **The board ages while you play.** Heat builds off whatever you make it
  dissipate, dry joints drop a bend out of the path mid-note, and *Re-solder*
  rewires the signal chain on its own.
- **The sampler is the tape.** Drop an audio file anywhere on the page, or roll
  one off archive.org, and it plays at any speed either way round. Arm *Record*
  and the board lays its own output back onto the reel where the play head is
  reading: what comes past next lap has been through the mix bus, the bends, the
  pedals and the tape machine, and goes through all of them again. Nothing
  stands in for generation loss — the loop really is re-recorded every lap,
  which is why a bend in the path makes it diverge rather than fade. The reel
  under the keys is drawn off the tape as the head reads it: drag its two
  markers to trim the loop, drag the tape itself to move the head.
- **A microphone into the middle of the board.** *Mic patch* is not a channel —
  on one setting the mic reaches the mix, on the other six it is soldered onto
  the chip's rail, an oscillator's FM input or the delay's feedback. The body
  contact pad is the same idea with your finger as the resistor.
- **Boards, rather than settings.** ${PRESETS.length} presets, and dice on every heading as
  well as on the whole board; **morph** travels between two boards over up to
  thirty seconds instead of cutting; **hunt** auditions six candidates and keeps
  the one closest to the edge; **drift** nudges the board along on a timer. All
  of it lands in a walk you can ctrl+z back down.
- **A link is a patch.** The board packs into the URL short enough to survive a
  chat window, and a long \`#set=\` form names the controls if you would rather
  type one. Play it over MIDI, record it to wav.

[Bends](BENDS.md) explains how the interesting parts work and why they behave
as they do. What follows is the list, for finding out whether something exists
and what it is called.

A **†** marks a shy control: one a roll brings on rarely and low, so no single
effect buries the board. Your own hand still puts it where you want it, and a
preset that names it still gets it. ${
    ALL_SLIDERS.filter(s => s.shy).length
  } of them, mostly the ones that cover
the board rather than joining it.
`)

  for (const place of STAGE_ORDER) {
    const groups = byPlace.get(place)!
    if (!groups.length) continue
    out.push(`## ${place}\n`)
    if (place === 'Bends') {
      out.push(
        `${cap(num(BENDS.length))} for ${num(slots)} slots, so one always sits out, and the slots are ordered. Each has a mix, and a mix at zero takes the stage out of the path rather than merely silencing it.\n`,
      )
    }
    // The bends are a rack and the pedals are a board, and every drawing of the
    // path runs them together as one row of boxes. Said once, where the second
    // half starts.
    if (place === 'Pedals') {
      out.push(
        `${cap(num(groups.length))} boxes after the bends, in an order of their own. Not the same kind of order as the rack upstream: there are no sockets and nothing sits out — all ${num(groups.length)} are always on the board, and a pedal comes out of the path on its own mix rather than by leaving the run.\n`,
      )
    }
    for (const g of groups) out.push(groupSection(g))
  }

  out.push(`## Around the instrument

- **Roll** randomises the board with a bias toward leaving something audible;
  the controls marked † come on rarely and low, so a roll does not bury the
  board under one effect. **Mutate** shakes the board you have rather than
  replacing it.
- **Dice on every heading**, not only on the stage, with a *reset* beside them
  that says how many controls it would put back. A heading is where the controls
  that only mean anything together live, so you can roll a knife on the toy's
  bus without re-rolling its clock and its bend pot underneath you.
- **Morph** travels between two boards rather than jumping, and pressing it
  mid-flight keeps the half-way board — a board like any other. **Hunt**
  auditions candidates and keeps whichever spends the most time arriving at the
  limiter and backing off, which is what the edge sounds like from outside.
  **Drift** sets the board off for somewhere near where it stands every fifteen
  seconds and never lets it arrive; it banks none of it, so the board you set
  drifting is one undo away.
- **The walk**: every gesture that lands a board — a preset, a roll, a stage
  reset, a sweep of one knob — is a step, and ctrl+z and ctrl+shift+z go back
  and forward through them.
- **The board rides in the URL**, so a link is a patch: \`#p=\` packs it into a
  few dozen characters, \`#set=\` spells the moved controls out by name for
  typing at the address bar, and arriving on one keeps the bar writing that
  form. A link
  never presses play; a reload of your own tab comes back running whatever it
  was running.
- **Play it from the computer keyboard** — \`a s d f\` for the keys, \`z\` and \`x\`
  for octaves, \`1\`–\`6\` for the kit, space for both machines.
- **MIDI in** — notes, velocity, and knobs that map onto the panel, including
  endless encoders with lit rings.
- **Record to wav**, straight off the output.
- **A live signal-path map** that greys out whatever is not in the path, and is
  the way into every stage's controls.
- **A desk** with every source's fader and a meter beside it, because how far a
  fader is up and whether anything is coming out of that machine are not the
  same question.
- **The reel**, drawn off the tape as it plays: the loop's two markers, the play
  head and which way it is going.
- **Scope, meters and a rail lamp**, all fed by the meter message.

### Presets

${PRESETS.length} boards worth keeping. Every name is a link that opens the app with
that board on it — a link never presses play, so it is loaded and waiting.

${PRESETS.map(p => `- [**${p.name}**](${presetUrl(p.patch)}) — ${p.blurb}`).join('\n')}

### Kit voices

${DRUM_VOICES.map(v => `- **${v.label}** — ${v.help}`).join('\n')}

## Scripts
`)

  const scriptRows = Object.keys(pkg.scripts)
    .map(name => {
      const what = SCRIPTS[name]
      if (!what) {
        throw new Error(
          `no description for script '${name}' — add one to SCRIPTS in scripts/features.ts`,
        )
      }
      return `| \`pnpm ${name}\` | ${what} |`
    })
    .join('\n')
  out.push(
    `${fold(
      `${Object.keys(pkg.scripts).length} commands`,
      `| command | what it does |\n| --- | --- |\n${scriptRows}`,
    )}\n`,
  )

  out.push(`What the performance numbers mean, and which of them are
trustworthy, is [optimizations.md](optimizations.md). How a block gets rendered
at all is [dataflow.md](dataflow.md).
`)

  return out.join('\n')
}

// Compared as paths rather than as strings: a directory with a space in it
// url-encodes on one side and not the other, and the generator would quietly
// write nothing — the one failure this file exists to prevent.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(
    new URL('../docs/features.md', import.meta.url),
    await renderFeatures(),
  )
}

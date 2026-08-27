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
import { BENDS } from '../src/ui/controls/bends'
import { ALL_SLIDERS, CHANNELS, GROUPS } from '../src/ui/controls'
import type { Group, SliderDef } from '../src/ui/controls/types'
import { STAGE_ORDER } from '../src/ui/controls/types'
import { CUTS } from '../src/ui/presets/cuts'
import { PRESETS } from '../src/ui/presets/table'
import { boardHash } from '../src/ui/share'
import { DEFAULT_CONTROLS } from '../src/controls'
import { ROMS } from '../src/dsp/stages/roms'
import { DRUM_VOICES, GRID_ROWS, STEPS } from '../src/drums'
import pkg from '../package.json' with { type: 'json' }

const BLURBS: Record<string, string> = {
  'Toy keyboard':
    'The instrument the whole thing is named after: a square-wave divider chip running a ROM, with a tone control that taps the divider at a different width, an auto bass-chord section, and playable voices over the top. Its clock, its counter, its bias and its gate are each a place you can solder a pot onto — *Bend spot* picks which, *Bend pot* is how far. Everything from *Starve* down is the supply underneath it.',
  'Toy drums':
    'A step grid with a length per row, so a five-step hat runs against a sixteen-step kick until they line back up. *Retrigger* hammers the current step at audio rate; *Cross-patch* leans one voice’s amplifier onto another’s envelope, so a hit you can hear opens a voice nothing struck. *Address line* and *Data line* put a knife through the wires between the step counter and the pattern memory: the counter goes on counting and the grid goes on chasing it, and the machine plays somebody else’s pattern.',
  'FM chip':
    'The other synthesiser on the board: two operators a voice, four voices, on the same rail. It has no keyboard and no sequencer of its own — its key input is soldered onto the toy’s gate line, so it plays whatever strikes a note over there, and *Struck by* clips the kit’s trigger lines on beside it. Nothing about it is played, though; it is *configured*, one byte at a time, over a bus. Which is what *Data line* and *Address line* are for: a byte that lands wrong stays wrong until the processor writes that register again, and if the wire carrying the key back up cannot go low, the note never ends. *Wave line* is the other bus, the one the processor never touches — the sine is a table and a table is an address, so a knife there changes the shape of the wave under your hand and leaves nothing behind. *Effect* is the ROM’s other job: a bird, surf, wind, a siren or crickets, each of them a program in the processor spraying register writes rather than a sample, which makes it the busiest thing the bus ever carries.',
  'Chaos osc':
    'Two oscillators on one starving supply. B drags A’s frequency around, the output current drains the rail, the rail drags pitch and amplitude, and the stall-and-recover cycle motorboats on its own.',
  'Noise & crackle':
    'Hiss with a colour control, and sparse crackle with a rate of its own.',
  Sampler:
    'A loaded audio file, looping through the chain — or, with *Struck by* on a voice and *Ending* on one-shot, a seventh drum voice playing whatever you dropped.',
  Mic: 'A live microphone, and the one source that does not have to reach the mix. *Mic patch* is the whole of it: the wire can go onto the chip’s supply rail instead, or into the oscillator’s FM input, the delay’s feedback, the ring modulator’s carrier, or a trigger line — so a shout browns the toy out, or fires the kit, rather than simply being loud.',
  'Mix bus':
    'The desk the six sources meet at, and the only place their balance against each other is a thing you can see. Every fader is drawn here as well as on its own machine’s panel — under the machine’s name rather than the word *Level*, which six of them carry — with a meter beside it reading what that channel is actually putting on the bus, and the bus’s own meter under the lot. A fader says how far it is up; it does not say whether anything is coming out. The FM chip is the reason: it boots at zero, it has no keyboard of its own, and turned up on a toy nothing is striking it is a channel at three quarters and silence. *Bus drive* is the desk’s own knob — the summing amp, a wire at unity and the one saturation ahead of the bends anywhere off it.',
  'Slot order':
    'Which bend sits in which position, and therefore what order they run in. Fewer slots than bends, so one always sits out.',
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
  Stompbox:
    'Each circuit is its own model rather than one circuit with a knob on it. *Screamer* clips inside the feedback loop so the dry note walks under it; *rat* clips to ground behind a slew-limited op-amp; *muff* is two clipping stages and a scooped tone stack; *germanium* is the lopsided one whose bias rides down on the signal; *octave* rectifies into a ringing transformer; *gate* is misbiased to the edge of cutoff.',
  'Tape delay':
    'The capstan is a real motor: it has weight, it answers the brake slowly, and *Supply drag* wires it to the same dying rail as the toy, so the repeats dive in pitch as the board browns out.',
  'Delay pedal':
    'The normal box on a board of abused ones, and the one thing here that behaves. *Standard* moves its time by crossing between two read heads rather than dragging one, so the repeats already in the buffer keep their pitch while your hand is on the knob \u2014 which is the whole difference between this and the tape machine next to it. *Analog* is a bucket brigade, and the clock that sets the delay is also what sets the bandwidth, so long is muddy by construction and the compander breathes behind the repeats. *Reverse* plays each window backwards, relocking at the seam.',
  'Spring verb':
    'Dispersive allpass cascade into short parallel combs — metallic, boingy, deliberately cheap.',
  'Patch bay':
    'Wires, each from a source to a destination at a signed depth. A wire can also land on another wire’s depth, which is how the bay modulates itself.',
  'Trigger patch':
    'The two boxes’ trigger lines, bridged. The kit can play the keys and the keys can play the kit.',
  'Body contact': 'Two axes, for the hand on the circuit.',
  'Feedback bus':
    'The output fed back in, at a loop time short enough for kHz mixer squeal — the block-rate global loop is far too slow for that. *Patched into* decides where the return lands.',
  'Tape machine':
    'The whole instrument printed to tape, after everything else. Speed moves gap loss, head bump, hiss, wow rate and print-through together, because on a real machine they are one thing.',
  Brownout: 'The mains supply failing: sag, dropouts, crackle and hum.',
  Output: 'Gain, ahead of a dc block, soft clip and limiter that always run.',
  'Board parts':
    'What the toy board is made of, rather than what you are doing to it. Every one of these was a number compiled into the model until somebody wanted the other value, and every default is the one that shipped — so a board nobody has been at here is the stock board. *Timing pin* decides which sags the tempo notices. *Watchdog* is where the reset chip gives up, and it cannot sit under the voltage the die gives up at. *Latch hold* is what a jam sounds like. The four *Clip* knobs are the paperclip itself: how hard it bites, how long it stays, and the charge and release that make a dive a dive rather than a warble. *Clock drag* is how deep the cap on the oscillator can divide. *Part spread* is how far apart the four output stages came out of the bin, which is whether a chord collapses raggedly or all at once.',
  Wear: 'The slow ones. *Heat* builds with what the board is dissipating and takes the rail down with it. *Dry joints* drop a bend slot out of the path mid-note. *Re-solder* has the board rewire its own slot order while you play. *Cross-coupling* is how much the brightness bus feeds back into the supply.',
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
  knife:
    'sweeps every wire and fault on all five buses and reports which you can hear',
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
// the preset moves and where it puts them, which `#p=AEYvUFqWAQBVAmQsCQG5AQ`
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
    return `\nThe desk is a widget rather than a row of sliders, and the ${num(CHANNELS.length)} faders
on it are counted under the machines they belong to rather than here: a fader is
the first knob on its own machine's panel and one strip of this one.\n`
  if (g.editor?.kind !== 'drums') return ''
  const n = g.editor.keys.length
  return `\nThe pattern grid is a widget rather than a row of sliders, so the table
below leaves it out: ${num(GRID_ROWS.length)} rows (the ${num(DRUM_VOICES.length)} voices and an accent), each
carrying ${STEPS} steps and a length of its own. That is ${n} more controls, and they
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
  return `\nNamed cuts, one press each under *${first.part}*, which is where the
panel keeps them too — the knife goes on and the rows under it say which
controls that was:\n\n${lines}\n`
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
  return `### ${g.name}\n\n${blurb}\n${grid(g)}${cuts(g)}\n${fold(
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
  const slots = GROUPS.find(g => g.name === 'Slot order')!.sliders.length
  const wires = GROUPS.find(g => g.name === 'Patch bay')!
  const dests = wires.sliders.find(s => s.label.endsWith('to'))!.choices!.length

  out.push(`<!-- Generated by \`pnpm features\`. Edit scripts/features.ts, not this file. -->

# What is in the box

A virtual toy keyboard and drum machine, run on a supply rail you are allowed to
ruin. ${sliders.length} knobs and switches in ${GROUPS.length} groups, ${num(BENDS.length)} bends competing for ${num(slots)} slots,
${ROMS.length} ROM tunes, ${PRESETS.length} presets and ${CUTS.length} named cuts — and everything below comes off
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
  they all go down together, and there is no setting where they come apart.
- **Solder a pot onto the die.** *Bend spot* picks the clock, the counter, the
  bias or the gate; *Bend pot* is how far you turn it. *Clip chatter* is the
  paperclip: bare metal dragged across the pads, biting the supply a few times a
  second, each touch a dive the board has to climb back out of.
- **Put a knife through the bus.** Cut, ground, bridge or pull up a data or
  address line — on the toy, on the drum machine, or on the FM chip — and the
  wrong byte lands. On the FM chip it *stays* wrong until the processor writes
  that register again. Which wire and what happened to it are three controls
  that only mean anything together, so each chip's *knife on the bus* opens on a
  row of named cuts: press **machine-gun** or **the note never ends** and the
  controls under it say what that was. **Random knife** in the dice row draws
  from the same table.
- **${cap(num(BENDS.length))} bends, ${num(slots)} slots.** You pick which are on the board and in what
  order, so one always sits out. A mix at zero takes the stage out of the path
  rather than merely silencing it.
- **A patch bay that modulates itself.** ${cap(num(wires.sliders.filter(s => s.label.endsWith('depth')).length))} wires, ${dests} destinations —
  and the last four of those destinations are the other wires' depths.
- **Feedback tight enough to squeal.** The whole chain runs inside one worklet
  \`process()\`, so the global loop is at audio rate and every feedback path
  saturates in-loop. Runaway is a feature; a fixed safety tail means no setting
  can blow up the output.
- **The board ages while you play.** Heat builds off whatever you are making it
  dissipate, dry joints drop a bend out of the path mid-note, and *Re-solder*
  rewires the slot order on its own.
- **The sampler is the tape.** Drop an audio file anywhere on the page, or roll
  one off archive.org, and it plays at any speed either way round. Arm *Record*
  and the board lays its own output back onto the reel on the spot the play head
  is reading: what comes past next lap has been through the mix bus, the bends,
  the pedals and the tape machine, and then goes through all of them again.
  Nothing stands in for generation loss — the loop really is re-recorded every
  lap, which is why a bend in the path makes it diverge rather than fade. The
  reel is drawn under the keys, redrawn off the tape as the head reads it: drag
  its two markers to trim the loop, drag the tape itself to move the head.
- **A microphone into the middle of the board.** *Mic patch* is not a channel —
  on one setting the mic reaches the mix, and on the other six it is soldered
  onto the chip's rail, an oscillator's FM input or the delay's feedback. The
  body contact pad is the same idea with your finger as the resistor.
- **Boards, rather than settings.** ${PRESETS.length} presets and dice that roll the whole
  board, one stage, or a knife; **morph** travels between two boards over up to
  thirty seconds instead of cutting to one; **hunt** auditions six candidates and
  keeps the one closest to the edge; **drift** nudges the board along on a timer.
  Every one of those lands in a walk you can ctrl+z back down.
- **A link is a patch.** The whole board rides in the URL. Play it over MIDI,
  record it to wav.

[Bends](BENDS.md) explains how the interesting parts work and why they behave
as they do. What follows is the list, for finding out whether something exists
and what it is called.

A **†** marks a shy control: one a roll brings on rarely and low, so no single
effect buries the board. Your own hand still puts it wherever you want it, and a
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
        `${cap(num(BENDS.length))} of them for ${num(GROUPS.find(g => g.name === 'Slot order')!.sliders.length)} slots, so one always sits out — and the slots are ordered, so which comes first is yours. Each has a mix, and a mix at zero takes the stage out of the path rather than merely silencing it.\n`,
      )
    }
    for (const g of groups) out.push(groupSection(g))
  }

  out.push(`## Around the instrument

- **Roll** randomises the board with a bias toward leaving something audible;
  the controls marked † come on rarely and low, so a roll does not bury the
  board under one effect. **Mutate** shakes the board you have rather than
  replacing it, and each stage has dice of its own.
- **Morph** travels between two boards over time rather than jumping, and
  pressing it mid-flight keeps the half-way board — which is a board like any
  other. **Hunt** auditions candidates and keeps whichever spends the most time
  arriving at the limiter and backing off, which is what the edge sounds like
  from outside. **Drift** sets the board off for somewhere near where it stands
  every fifteen seconds and never lets it arrive, so it keeps moving rather than
  being replaced — and banks none of it, so the board you set drifting is still
  one undo away.
- **The walk**: every gesture that lands a board — a preset, a roll, a stage
  reset, a sweep of one knob — is a step, and ctrl+z and ctrl+shift+z go back
  and forward through them.
- **The board rides in the URL**, so a link is a patch. A link never presses
  play; a reload of your own tab comes back running whatever it was running.
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

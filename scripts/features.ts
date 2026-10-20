import { format, resolveConfig } from 'prettier'

import pkg from '../package.json' with { type: 'json' }
import { DEFAULT_CONTROLS } from '../src/controls.ts'
import { DRUM_VOICES, GRID_ROWS, STEPS } from '../src/drums.ts'
import { ROMS } from '../src/dsp/stages/roms.ts'
import { PEDAL_ORDERS } from '../src/pedals.ts'
import { BENDS, BEND_SLOT_KEYS } from '../src/ui/controls/bends.ts'
import { ALL_SLIDERS, CHANNELS, GROUPS } from '../src/ui/controls/index.ts'
import { STAGE_ORDER } from '../src/ui/controls/types.ts'
import { MIC_JACKS } from '../src/ui/micWiring.ts'
import { CUTS } from '../src/ui/presets/cuts.ts'
import { RIGS } from '../src/ui/presets/rigs.ts'
import { PRESETS } from '../src/ui/presets/table.ts'
import { boardHash } from '../src/ui/share.ts'

import type { Group, SliderDef } from '../src/ui/controls/types.ts'

// Generates docs/features.md; features.test.ts fails if the committed copy
// falls behind. Counts, group names, ranges and choices come from the control
// tables, each control's line comes from its tooltip, and BLURBS holds the text
// a table cannot say. A group without a BLURBS entry throws.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BLURBS: Record<string, string> = {
  Plinky:
    'A square-wave divider chip running a ROM, with a tone control that taps the divider at a different width, an auto bass-chord section, playable voices over the top and six effect buttons that sweep the divider. Its clock, counter, bias and gate are each a place to solder a pot onto: *Bend spot* picks which and *Bend pot* sets how far. The panel *Power supply* holds the battery rail that Plinky shares with four other machines.',
  'Power supply':
    'Plinky, drums, Glint, Parlor and Growler all run off this battery rail, so a sag here bends all five at once. *Starve* pulls the rail down, *Batteries* keeps it below full, *Lead resistance* makes every note sag it on the attack, and *Reservoir* sets how long the rail takes to get there. *Watchdog* is the voltage at which the reset chip reboots the chips, and *Latch-up* is how often a brownout jams one instead. The *Clip* knobs set the paperclip: how often it touches, how hard it bites, how long it stays, and the charge and release rates. A release faster than the charge makes the touch a dive.',
  Clatter:
    'A step grid with a length per row, so a five-step hat runs against a sixteen-step kick until they line back up. *Retrigger* repeats the current step at audio rate. *Cross-patch* connects one voice’s amplifier to another’s envelope, so a hit you can hear opens a voice nothing struck. *Address line* and *Data line* cut the wires between the step counter and the pattern memory: the counter keeps counting, the memory returns the wrong steps, and the machine plays a pattern nobody wrote.',
  Glint:
    'The board’s FM synthesiser: two operators a voice, four voices, on the same rail. It has no sequencer: its key input is soldered onto the toy’s gate line, so out of the box it plays whatever strikes a note there. *Struck by* also clips the kit’s trigger lines on, and *Follows toy* cuts the gate jumper (it then reads *own keys only*), so Glint plays only from the keybed on its board. Once the chip is up in the mix, the panel draws that keybed under the toy’s, with a hold and octave for each, and the *keys* switch on either deck sets which of the two the computer’s letter keys play. A processor configures Glint a byte at a time over a bus, and *Data line* and *Address line* cut that bus: a byte that lands wrong stays wrong until the processor writes that register again, and if the wire carrying the key back up cannot go low, the note never ends. *Wave line* cuts the other bus, which the processor never touches. The sine is a table and a table is an address, so a knife there reshapes the wave as you play and leaves nothing behind. *Effect* plays a bird, surf, wind, a siren or crickets from the ROM. Each is a program of register writes, the busiest traffic the bus ever carries. The effect buttons over the keys run any of them while held.',
  Parlor:
    'An eight-bit sampling home keyboard, and the only machine on this board that makes pads, strings, choirs and bells. It has no oscillator: a ROM holds one short recording of each voice, an attack and then a loop, and a counter steps through that ROM at the rate the note asks for. The ROM was cut at 9.9 kHz and nothing interpolates on the way out, so every voice has its images over it, and *Tone*, a two-pole reconstruction filter, sets how much of that you hear. The rate is a twelve-bit divider, so the top octave comes out a few cents sharp and the bottom is in tune. *Address line* cuts the counter’s wires, so each word is real but read from the wrong place and a voice folds onto its first half or reads every sample twice. *Data line* cuts the wires out of the ROM; held high, the top wire folds the bottom half of every wave up onto the top of it. *Chord memory* puts a voicing under one key and fills all four voices with it. *sampled* plays whatever you dropped on the sampler across the keyboard, from a second and a half of memory, with the reel’s loop markers as its loop.',
  Growler:
    'A three-oscillator monosynth voice card after the Model D, soldered onto the toy’s supply and gate line. It has three band-limited oscillators with hard sync and a sweep for osc 2, a mixer with noise and the output looped back in, and a four-pole transistor ladder filter that saturates and self-oscillates. It also has two contour generators, glide, and osc 3 as a modulator at audio rate or below. Out of the box the toy’s tune plays it two octaves down; *Gate* sets how long each struck note stays down, and at 1 the tune plays legato and slides. *Struck by* clips the kit’s trigger lines on, so a kick can restart the bass. The voice card has these faults: a converter with no heater, a VCA that leaks, oversized contour caps, a mismatched ladder pair, a drooping pitch hold, a stuck bit on the key DAC and a weak regulator.',
  'Chaos osc':
    'Two oscillators share one starving supply: B modulates A’s frequency, the output current drains the rail, the rail modulates pitch and amplitude, and the stall-and-recover cycle motorboats without any input.',
  'Noise & crackle':
    'Hiss with a colour control, and sparse crackle with a rate control.',
  Spool:
    'A loaded audio file, looping through the chain. With *Struck by* on a voice and *Ending* on one-shot, it plays whatever you dropped as a seventh drum voice. A bay wire can connect to the reel’s capstan and both loop markers, so it can shift the reel’s pitch as a starve shifts the toy’s, or move the loop window around the recording while the head plays on.',
  Layercake:
    'A cassette four-track: a desk of four channel strips, each with knobs and a fader, in front of four tape loops, each cut to a separate length and all on one capstan. A channel takes its input from its loop, the board, the mic or the desk’s aux return, passes it through a trim preamp and three bands of EQ into a fader and an aux send, and records onto its loop over whatever the erase head left. With input on the board and a loop recording, the signal loops round the whole board, so each lap comes back through every bend again. With input on the aux and its send up, the desk is a mixer with nothing plugged in: the sweepable mid tunes the squeal and the op-amp rails clip it. *Wear* sheds oxide at the same places every lap, and *Batteries* lowers the motor and the rails together.',
  Mic: 'A live microphone, the one source that need not reach the mix. *Mic patch* picks the jack: the mix, the toy’s supply rail, clock pin, address bus or data bus, the oscillator’s FM or sync input, the delay’s feedback, the ring modulator’s carrier, a trigger line, Spool’s capstan motor, Growler’s external input or Glint’s data bus. *Mic into* on the bench bar and the mic cap on each machine list the jacks with what a voice does at each.',
  'Mix bus':
    'The seven sources meet at this desk, and every fader appears here as well as on its machine’s panel, under the machine’s name, with a meter beside it that reads what that channel puts on the bus, and the bus’s own meter under the lot. A fader’s position does not show whether sound is coming out. Glint shows the difference: it boots at zero, and turned up with nothing striking it (no hand on its keys, no tune next door) it sits at three quarters and plays silence. *Bus drive* is the summing amp, at unity gain at 0 dB and the one saturation ahead of the bends.',
  'Ring mod': 'Amplitude modulation by a carrier, sine or square.',
  Crusher:
    'Bit depth and sample rate, both reducible until the signal breaks up, with jitter on the rate.',
  Clipper:
    'A rack of clipping circuits, with bias, a tone control and a sub octave.',
  Comb: 'A tuned delay with feedback past unity — a pitch you can drive into oscillation.',
  'Screech filter':
    'Resonant filter with drive, taken past self-oscillation so it rings without input.',
  'Glitch buffer':
    'Catches slices and repeats them, sometimes reversed, sometimes transposed, sometimes held.',
  'Freq shifter':
    'Bode-style: every partial moves by the same number of Hz rather than the same ratio, so harmonic input comes out inharmonic. With feedback each lap shifts again and partials climb forever.',
  'Signal order':
    'The Signal order panel orders both runs: the six positions the bends compete for, between the mix bus and the pedals, and the six pedals downstream of them. It draws two racks, *onboard effects* first and *pedals* second. Drag a box to move it, or move it with the arrow keys. To bring in a bend that is off the board, drag it or press it in the first section. A crusher into a filter and a filter into a crusher use the same two stages and sound different, and fuzz into a reverb gives a wall with a room behind it where a reverb into fuzz gives the room itself distorting. Seven bends compete for six positions, so one always sits out. All six pedals stay on the board, and a pedal leaves the path when its mix is at zero.',
  Gnash:
    'Gnash models each circuit separately: *Screamer* clips inside the feedback loop so the dry note passes under it; *rat* clips to ground behind a slew-limited op-amp; *muff* is two clipping stages and a scooped tone stack; *germanium* clips asymmetrically, with its bias moving down under the signal; *octave* rectifies into a ringing transformer; *gate* is misbiased to the edge of cutoff.',
  Wraith:
    'The capstan motor has inertia and answers the brake slowly, and *Supply drag* connects it to the same sagging rail as the toy, so the repeats dive in pitch as the board browns out. Three play heads sit along the tape at one, two and three spacings, and *Heads* sets which of them are engaged. The tape is a five-second loop joined once: *Splice* sets how bad the join is, and *Erase* sets how much of the last lap the erase head lets through under the new one.',
  Ricochet:
    'A conventional delay pedal, whose *Standard* mode changes its time by crossing between two read heads, so the repeats already in the buffer keep their pitch while you turn the knob. Wraith moves a single head instead, and its repeats change pitch. *Analog* is a bucket brigade whose clock sets the delay and the bandwidth together. Past a second the repeats turn to grit before they turn to mud, the clock itself whistles through, and the compander breathes behind it all. *Reverse* plays each window backwards, relocking at the seam. *Hold* lifts the record head on every hit and loops the window it just recorded, which with the kit running is a beat repeat.',
  Boing:
    'A dispersive allpass cascade into short parallel combs, which sounds metallic and boingy and is deliberately cheap. The springs swing until they meet the box, and *Kick* sets how easily a slam at the input or a hit from the kit throws them against it. That crashes the tank, the sound of kicking the amp.',
  Chorale:
    'Chorale is one circuit at five clock rates, and its lines are bucket brigades, so one control sets the delay and the bandwidth: short is clean and long is dark, and at the top of the travel the clock itself is audible with the compander breathing behind it. *Chorus* is one line swept slowly, with the wet on one output and dry plus wet on the other. *Ensemble* is three lines 120° apart on a slow sway with a fast shimmer over it. *Dimension* is two lines swept against each other, one to each side with the dry up the middle, so the wobble cancels when you sum to mono and only the width remains. *Vibrato* removes the dry signal. *Flange* uses the same line, an order of magnitude shorter, with feedback around it.',
  Ember:
    'Gain stages, a passive tone stack, a push-pull power stage on a supply that sags, an output transformer and a speaker, run at twice the board’s rate so the clipping does not alias. Each triode clips its two halves differently, and a conducting grid charges its coupling cap, so a hard chord squashes the next note for a moment. The tone stack is the network of three pots that load each other, solved from its netlist, so each knob also changes what the other two do. *Fender* is one gain stage into the stack and a recovery stage; *marshall* cascades two ahead of it, with small cathode caps that thin the bass. A cold *Bias* leaves the output pair crossing over on quiet notes, and *Sag* pulls the rail down under load, with the board’s sagging supply pulling it down too. Three faults sit on the stages: a *Dry cathode cap* that thins the bass and loses gain, a *Weak tube* that loses its even-harmonic cancellation and then arcs, and a *Microphonic* first tube that picks up the cabinet and howls at its resonance. The panel draws the path, with the tone stack’s response underneath.',
  'Patch bay':
    'The bay holds wires, each from a source to a destination at a signed depth. A wire can connect to the toy’s supply rail, the tape loop’s capstan and loop markers, or another wire’s depth, so the bay can modulate itself.',
  'Trigger patch':
    'The Trigger patch panel sets which machine plays which. The kit can play Plinky and the keyboard can play the kit, and Glint, Parlor and Growler each take the kit’s hits through *Kit voice that plays this…* and Plinky’s notes through a jumper that is soldered out of the box.',
  'Body contact': 'Two axes that put a hand on the circuit.',
  'Feedback bus':
    'The output feeds back in, with a loop time short enough for kHz mixer squeal. *Patched into* sets where the return connects.',
  'Tape machine':
    'Prints the whole instrument to tape, after everything else. Speed moves gap loss, head bump, hiss, wow rate and print-through together, because on a real machine they all depend on tape speed.',
  Brownout: 'The mains supply failing: sag, dropouts, crackle and hum.',
  Output: 'Gain, ahead of a dc block, soft clip and limiter that always run.',
  'Board parts':
    'Each control here sets a part of the toy board itself, and each default is the stock value, so an untouched board here is the stock board. *Timing pin* sets which sags change the tempo. *Clock drag* sets how deep the cap on the oscillator can divide. *Part spread* sets how far apart the four output stages came out of the bin, which decides whether a chord collapses raggedly or all at once.',
  Wear: 'The slow, board-wide faults start with *Heat*, which builds with what the board dissipates and lowers the rail. *Fault clustering* redistributes every fault on the board from a flat rate into bursts. *Cross-coupling* sets how much the brightness bus feeds back into the supply. *Dry joints* drops the bend in a slot out of the path mid-note: a click on the way out, another on the way back, and whatever it was ringing cut off mid-ring. *Re-solder* swaps two slots while you play, or moves the feedback return to a different pin, so the order changes without a hand on a control. *Dry joints* and *Re-solder* write to no control, so the settings stay where you left them while the path changes underneath, and the rack on the Signal order panel shows it happening.',
}

const SCRIPTS: Record<string, string> = {
  dev: 'the app',
  build: 'typecheck and bundle',
  test: 'the suite without the sixteen slowest files, with a two-second torture test that pins every feedback past unity at once, and the panel in jsdom',
  'test:full':
    'the suite plus the sixteen files that take fifteen seconds or more of audio rendering; CI runs this',
  'test:changed':
    'only the test files that import something changed since main',
  typecheck: 'types only',
  check: 'lint, typecheck and the changed tests, for the edit loop',
  'blog:draft': 'drafts a blog post from the feat commits since the last one',
  'sync:check': 'compare the regions shared with videoskillet',
  lint: 'oxlint, type-aware',
  'lint:fix': 'oxlint, fixing what it can',
  format: 'oxfmt, and prettier for .astro',
  'format:check': 'oxfmt and prettier, checking without writing',
  version: 'writes CHANGELOG.md for the release commit (npm runs it)',
  bench: 'what the chain costs per block, stage by stage',
  blocks:
    'the distribution — p50 to p99.9, and how many blocks went over budget',
  cold: 'the first seconds, before anything has tiered up',
  cpu: 'CPU time on every Chrome thread, and the underruns Chrome counted',
  ab: 'this tree against a git ref, as a paired comparison',
  'bend-ends':
    'renders each control at both ends of its travel and writes down the ends a bend key can be heard at',
  audible:
    'takes each branch of the kit out one at a time and reports whether the output moved — a path can cost a multiply a sample and still be inaudible',
  denormal: 'the DSP sweep for denormals, run on demand and outside the suite',
  soak: 'whether any stage gets slower the longer it runs',
  panel: 'what the panel costs the browser per frame, in a real Chrome',
  agent:
    'drives window.bender in headless Chrome and checks what bender.listen reports',
  arrive:
    'opens a link in headless Chrome and checks that the board loads, the overlay shows where to press, and pressing it plays — as sent, and with a full stop or a bracket stuck to the url',
  'agent:eval':
    'runs claude -p --chrome sessions against the app, one per task, and grades the board each one leaves',
  controls:
    'lists every button and select on the panel by rendered height, with `--touch` for a finger',
  ink: 'walks every stage at three widths, looking for text drawn over text, a control nothing can announce, and text too faint to read',
  demos: "writes demos.json into the README's Demos block",
  reel: "renders the showcase demos to mp3 for the landing page's Demos section",
  diagram: "re-renders the README's signal path",
  features: 'rewrites docs/features.md — this file',
  'guide-shots': 're-shoots the six pictures in docs/USER-GUIDE.md',
  'diagram-shots':
    'shoots every schematic in the panel to a directory, one png each',
  dash: "re-shoots the why-sign-in card's screenshot of the signed-in home page",
  knife:
    'sweeps every wire and fault on every bus and reports which you can hear',
  spectrum:
    'sweeps every wire and fault on every bus and reports what each sounds like, by frequency',
  preview: 'serves the built bundle',
  prepare: 'points git at .githooks',
  pat: 'release: patch',
  min: 'release: minor',
  maj: 'release: major',
}

const LIVE = 'https://cmdcolin.github.io/bender/app/'

// The long `#set=` form names the controls a preset moves; the short `#p=` form does not.
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

// A list longer than MANY prints its ends and its count: the pedal order has
// 720 values.
const MANY = 12

function range(s: SliderDef): string {
  if (s.choices)
    return s.choices.length === 2
      ? s.choices.join(' or ')
      : s.choices.length > MANY
        ? `${s.choices.length} of them, ${s.choices[0]} through ${s.choices.at(-1)}`
        : s.choices.join(', ')
  const all = ends(s, s.min, s.max)
  return s.normal ? `${all}, normal ${ends(s, ...s.normal)}` : all
}

function ends(s: SliderDef, min: number, max: number): string {
  const { unit } = s
  const signed = s.min < 0
  const to = (a: string, b: string) => `${a} to ${b}`
  if (s.reads) return to(s.reads(min), s.reads(max))
  if (!unit) {
    if (min === 0 && max === 1 && !s.normal) return 'off to full'
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

// The first sentence of the tooltip, cut at the first colon, dash or semicolon
// when it runs long, because the range column holds the list.
function gloss(s: SliderDef): string {
  const [first = s.help] = s.help.split(/(?<=[.?!])\s+/)
  const trimmed = first.replace(/\.$/, '')
  if (trimmed.length <= 130) return trimmed
  const clause = trimmed.search(/[:—;]/)
  return clause > 0 && clause < 120 ? trimmed.slice(0, clause).trim() : trimmed
}

// Rows that differ only in a number in the label merge: 'Wire 1 from' through
// 'Wire 4 from' print as 'Wire 1–4 from'.
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

// The blank lines keep the table a markdown block that prettier formats.
const fold = (summary: string, body: string) =>
  `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`

// A group whose widget is not a row of sliders says so above the fold.
function grid(g: Group): string {
  if (g.editor?.kind === 'mixer')
    return `\nThe desk is a widget, and its ${num(CHANNELS.length)} faders
are counted under the machines they belong to: each is the first knob on that
machine's panel and one strip of this one.\n`
  if (g.editor?.kind === 'order')
    return `\nThe panel draws two racks in place of a row of sliders: the ${num(BEND_SLOT_KEYS.length)} bend-slot
controls under *onboard effects*, and the one order control under *pedals*. The
pedal order is a single control with ${num(PEDAL_ORDERS.length)} values instead of a socket per
pedal, so a roll, a link and a preset can all set it and every value is a valid
order. Because the racks draw these controls, the panel shows no dropdown for
either. A bend can sit in a position and still be inaudible, either because its
dry/wet is at zero or because it already ran higher up, and its row shows which.
The rows also show what *Solder* is doing to the path while you play: a position
the relay has moved shows where the board is running it, and one whose joint has
opened shows that it is out of the path. Neither of those is a control, so
these rows are the only place to see them. The pedal rows show nothing extra,
because all six pedals are always on the board.\n`
  if (g.editor?.kind !== 'drums') return ''
  const n = g.editor.keys.length
  return `\nThe pattern grid is a widget, so the table below leaves it out. It has ${num(GRID_ROWS.length + 1)} rows
(the ${num(DRUM_VOICES.length)} voices, an accent and an echo row), each with ${STEPS} steps and a
length, and a second ${STEPS}-step mask on every voice for the steps that sometimes
fire. That is ${n} more controls, and a link stores them like the rest.\n`
}

function cuts(g: Group): string {
  const mine = CUTS.filter(c => c.group === g.name)
  const [first] = mine
  if (!first) return ''
  const lines = mine.map(c => `- **${c.name}**: ${c.blurb}`).join('\n')
  return `\nNamed cuts, one press each under *${first.part}*, as in the panel.
A press puts the knife on, and the rows under it show the controls it set:\n\n${lines}\n`
}

function rigs(g: Group): string {
  const mine = RIGS.filter(r => r.group === g.name)
  if (mine.length === 0) return ''
  const lines = mine.map(r => `- **${r.name}**: ${r.blurb}`).join('\n')
  return `\nNamed settings, one press each at the head of the panel. A press resets
the stage to stock and writes the setting over it, and the rows underneath show
the result:\n\n${lines}\n`
}

function groupSection(g: Group): string {
  const blurb = BLURBS[g.name]
  if (!blurb) {
    throw new Error(
      `no blurb for control group '${g.name}' — add one to BLURBS in scripts/features.ts`,
    )
  }
  const table = rows(g.sliders).join('\n')
  return `### ${g.name}\n\n${blurb}\n${grid(g)}${rigs(g)}${cuts(g)}\n${fold(
    `${g.sliders.length} control${g.sliders.length === 1 ? '' : 's'}`,
    `| control | range | what it does |\n| --- | --- | --- |\n${table}`,
  )}\n`
}

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

A virtual toy keyboard and drum machine on a supply rail you can ruin. It has
${sliders.length} knobs and switches in ${GROUPS.length} groups, ${num(BENDS.length)} bends for ${num(slots)} slots,
${ROMS.length} ROM tunes, ${PRESETS.length} presets, ${RIGS.length} stage settings and ${CUTS.length} named cuts. The
generator reads everything below from the control tables, so the list stays in
step with the instrument.

Try it: **${LIVE}**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../img/chain-dark.svg">
  <img alt="The signal path: six sources sum into the mix bus, run through six reorderable bend slots and the pedals, then brownout, the tape machine and the output, with the feedback bus wired from the output back to the mix" src="../img/chain-light.svg" width="520">
</picture>

The signal-path map in the panel draws this diagram live as you play, from the
chain itself: the bends appear in the order you patched them and dead stages
grey out. \`pnpm diagram\` renders it with the same layout the app uses.

## The tour

- **The sounds come from circuit models.** The reboots, the pitch dives and the
  screams come from the mechanisms. One RC oscillator clocks the whole toy chip,
  so pitch, tempo and envelopes are the same thing divided: starve the rail and
  they all go down together, and no setting can separate them.
- **Solder a pot onto the die.** *Bend spot* picks the clock, the counter, the
  bias or the gate; *Bend pot* is how far you turn it. *Clip chatter* is the
  paperclip: bare metal dragged across the pads, touching the supply a few times
  a second. Each touch pulls the rail down, and the board recovers before the
  next.
- **Put a knife through the bus.** Cut, ground, bridge or pull up a data or
  address line, on the toy, the drum machine or Glint, and the chip reads the
  wrong byte; on Glint it *stays* wrong until the processor writes that
  register again. The wire, the fault and its depth only work together, so each
  chip's *knife on the bus* opens on a row of named cuts: press **machine-gun**
  or **the note never ends** and the rows under it show which controls it set.
  **Random knife** under random ▾ draws from the same table.
- **${cap(num(BENDS.length))} bends, ${num(slots)} slots.** You pick which are on the board and in what
  order, so one always sits out. A mix at zero takes the stage out of the path.
- **A patch bay that modulates itself.** ${cap(num(wires.sliders.filter(s => s.label.endsWith('depth')).length))} wires, ${dests} destinations, among them
  the supply rail, the tape loop's capstan, and the depths of the other wires.
- **Feedback tight enough to squeal.** The whole chain runs inside one worklet
  \`process()\`, so the global loop is at audio rate and every feedback path
  saturates in-loop. A fixed safety tail keeps any setting from blowing up the
  output.
- **The board ages while you play.** Heat builds with the power the board
  dissipates, *Dry joints* drop a bend out of the path mid-note, and *Re-solder*
  reorders the signal chain without a hand on a control.
- **The tape loop re-records itself.** Drop an audio file anywhere on the page,
  or roll one off archive.org, and it plays at any speed either way round. Press
  *rec* on the deck, or raise *Record*, and the deck records the board's output
  onto the reel at the play head. With nothing loaded, *rec* starts a first take on a
  blank reel, and a second press closes the loop at the length you played and
  starts it looping. Each later press overdubs, and *undo* removes the last
  overdub off again. The audio on the next lap has already been through the mix
  bus, the bends, the pedals and the tape machine, and goes through all of them
  again. The loop is re-recorded on every lap, so generation loss is real, and a
  bend in the path makes the loop diverge instead of fading. The reel under the
  keys shows the tape as the head reads it: drag its two markers to trim the
  loop, drag the tape itself to move the head. *Wear* and *Hiss* add the head's
  loss to each lap. The top end falls a little more every pass, and a layer of
  noise goes down under the last. *Hold* raises the write level by what a lap
  lost, so a loop stays at its level.
- **A microphone into the middle of the board.** *Mic into* on the bench bar
  solders the mic to one of ${MIC_JACKS.length} jacks: the toy's clock pin, so
  your pitch sets its tempo; its address or data bus, so a yell scrambles the
  song; Spool's capstan motor; Glint's registers. The body contact pad uses the
  same idea with your finger as the resistor.
- **Whole boards.** ${PRESETS.length} presets, and a roll button on every heading as
  well as on the whole board; **morph** moves between two boards over up to
  thirty seconds; **hunt** plays six candidates and keeps the one that spends
  the most time arriving at the limiter and backing off; **drift** shifts the
  board on a timer. Presets, rolls, morphs and hunts enter a walk that ctrl+z
  steps back through; drift does not.
- **A link is a patch.** The URL holds the board in a form short enough to
  survive a chat window, and a long \`#set=\` form names the controls if you
  would rather type one. Play it over MIDI, record it to wav.

[Bends](BENDS.md) explains how the bends work. The sections below list every
control, so you can check whether something exists and what it is called.

A **†** marks a shy control: one a roll brings on rarely and low, so no single
effect buries the board. Your hand can still set it anywhere, and a preset that
names it still sets it. ${
    ALL_SLIDERS.filter(s => s.shy).length
  } controls are shy, mostly the ones that act on the whole board.
`)

  for (const place of STAGE_ORDER) {
    const groups = byPlace.get(place)!
    if (!groups.length) continue
    out.push(`## ${place}\n`)
    if (place === 'Bends') {
      out.push(
        `${cap(num(BENDS.length))} bends compete for ${num(slots)} ordered slots, so one always sits out. Each has a mix, and a mix at zero takes the stage out of the path.\n`,
      )
    }
    if (place === 'Pedals') {
      out.push(
        `${cap(num(groups.length))} pedals follow the bends, and their order is not a rack: there are no sockets, all ${num(groups.length)} are always on the board, and a pedal at zero mix leaves the path.\n`,
      )
    }
    for (const g of groups) out.push(groupSection(g))
  }

  out.push(`## Around the instrument

- **Roll** randomises the board, weighted toward leaving something audible; the
  controls marked † come on rarely and low, so no single effect buries the
  board. **Mutate** perturbs the board you have instead of replacing it.
- **A roll button on every heading**, with a
  *reset* beside it that shows how many controls it would put back. A heading
  groups controls that only work together, so you can roll a knife on the toy's
  bus without re-rolling the toy's clock and bend pot.
- **Morph** moves between two boards over time, and pressing
  it mid-flight keeps the half-way board as an ordinary board. **Hunt** plays
  candidates and keeps the one that spends the most time arriving at the limiter
  and backing off. **Drift** moves the board to somewhere near where it stands
  every fifteen seconds, indefinitely. Drift adds no step to the walk, so one undo
  restores the board you set drifting.
- **The walk**: every gesture that sets a board, such as a preset, a roll, a
  stage reset or a sweep of one knob, is a step, and ctrl+z and ctrl+shift+z go
  back and forward through the steps.
- **The board is stored in the URL**, so a link is a patch: \`#p=\` packs it into
  a few dozen characters, \`#set=\` lists the moved controls by name for typing
  at the address bar, and after you open a \`#set=\` link the app keeps writing
  that form. Opening a link never starts playback, and reloading your own tab
  resumes whatever it was running.
- **Play it from the computer keyboard** — \`a s d f\` for the keys, \`z\` and \`x\`
  for octaves, \`1\`–\`6\` for the kit, space for both machines.
- **MIDI in** — notes, velocity, and knobs that map onto the panel, including
  endless encoders with lit rings.
- **Record to wav**, straight off the output.
- **A live signal-path map** that greys out whatever is not in the path, and is
  the way into every stage's controls.
- **A desk** with every source's fader and a meter beside it, since a fader's
  position does not show whether that machine is producing sound.
- **The reel**, drawn from the tape as it plays, shows the loop's two markers,
  the play head and its direction.
- **Scope, meters and a rail lamp**, all fed by the meter message.

### Presets

${PRESETS.length} presets. Each name is a link that opens the app with that board loaded, and
the board waits until you press play.

${PRESETS.map(p => `- [**${p.name}**](${presetUrl(p.patch)}) — ${p.blurb}`).join('\n')}

### Kit voices

Each of the eight kit voices is a circuit. On the sampled *Kit* setting, the
machine strikes all eight once through these circuits and plays the recordings
back.

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

  out.push(`[optimizations.md](optimizations.md) explains the performance numbers and
which of them to trust. [dataflow.md](dataflow.md) explains how a block gets
rendered.
`)

  return out.join('\n')
}

// Compared as paths: a directory with a space in it url-encodes on one side
// only, and the generator would write nothing.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(
    new URL('../docs/features.md', import.meta.url),
    await renderFeatures(),
  )
}

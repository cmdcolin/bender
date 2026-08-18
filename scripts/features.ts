// Generates docs/features.md. `pnpm features` rewrites it; features.test.ts
// fails if the committed copy falls behind.
//
// An inventory hand-written is an inventory that drifts, and nothing about a
// list of every control on the board is worth keeping current by diligence. So
// the counts, the group names, the ranges and every set of choices come off the
// control tables themselves. What is written here is the part a table cannot
// say: what each group is for.
//
// Adding a group without a line in BLURBS throws rather than quietly shipping a
// doc with a hole in it — which is the same reason the number of controls is
// counted rather than typed.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import { BENDS } from '../src/ui/controls/bends'
import { GROUPS } from '../src/ui/controls'
import type { Group, SliderDef } from '../src/ui/controls/types'
import { STAGE_ORDER } from '../src/ui/controls/types'
import { PRESETS } from '../src/ui/presets/table'
import { ROMS } from '../src/dsp/stages/roms'
import { DRUM_VOICES } from '../src/drums'
import pkg from '../package.json' with { type: 'json' }

const BLURBS: Record<string, string> = {
  'Toy keyboard':
    'The instrument the whole thing is named after: a square-wave divider chip running a ROM, with a tone control that taps the divider at a different width, an auto bass-chord section, and playable voices over the top. Its clock, its counter, its bias and its gate are each a place you can solder a pot onto — *Bend spot* picks which, *Bend pot* is how far. Everything from *Starve* down is the supply underneath it.',
  'Toy drums':
    'A step grid with a length per row, so a five-step hat runs against a sixteen-step kick until they line back up. *Retrigger* hammers the current step at audio rate; *Cross-patch* leans one voice’s amplifier onto another’s envelope, so a hit you can hear opens a voice nothing struck. *Address line* and *Data line* put a knife through the wires between the step counter and the pattern memory: the counter goes on counting and the grid goes on chasing it, and the machine plays somebody else’s pattern.',
  'FM chip':
    'The other synthesiser on the board: two operators a voice, four voices, on the same rail. It has no keyboard and no sequencer of its own — its key input is soldered onto the toy’s gate line, so it plays whatever strikes a note over there. Nothing about it is played, though; it is *configured*, one byte at a time, over a bus. Which is what *Data line* and *Address line* are for: a byte that lands wrong stays wrong until the processor writes that register again, and if the wire carrying the key back up cannot go low, the note never ends. *Effect* is the ROM’s other job: a bird, surf, wind, a siren or crickets, each of them a program in the processor spraying register writes rather than a sample, which makes it the busiest thing the bus ever carries.',
  'Chaos osc':
    'Two oscillators on one starving supply. B drags A’s frequency around, the output current drains the rail, the rail drags pitch and amplitude, and the stall-and-recover cycle motorboats on its own.',
  'Noise & crackle':
    'Hiss with a colour control, and sparse crackle with a rate of its own.',
  'Mic & sample':
    'A live microphone and a loaded sample. *Mic patch* is the interesting one — the mic does not have to go to the mix, it can go onto the chip’s supply rail, into the oscillator’s FM input, the delay’s feedback, the ring modulator’s carrier, or a trigger line.',
  'Slot order':
    'Which bend sits in which position, and therefore what order they run in. Fewer slots than bends, so one always sits out.',
  'Ring mod': 'Amplitude modulation by a carrier, sine or square.',
  Crusher:
    'Bit depth and sample rate, both down far enough to fall apart, with jitter on the rate.',
  Shaper:
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
  Parts:
    'What the toy board is made of, rather than what you are doing to it. Every one of these was a number compiled into the model until somebody wanted the other value, and every default is the one that shipped — so a board nobody has been at here is the stock board. *Timing pin* decides which sags the tempo notices. *Watchdog* is where the reset chip gives up, and it cannot sit under the voltage the die gives up at. *Latch hold* is what a jam sounds like. The four *Clip* knobs are the paperclip itself: how hard it bites, how long it stays, and the charge and release that make a dive a dive rather than a warble. *Clock drag* is how deep the cap on the oscillator can divide. *Part spread* is how far apart the four output stages came out of the bin, which is whether a chord collapses raggedly or all at once.',
  Ageing:
    'The slow ones. *Heat* builds with what the board is dissipating and takes the rail down with it. *Dry joints* drop a bend slot out of the path mid-note. *Re-solder* has the board rewire its own slot order while you play. *Cross-coupling* is how much the brightness bus feeds back into the supply.',
}

const SCRIPTS: Record<string, string> = {
  dev: 'the app',
  build: 'typecheck and bundle',
  test: 'the suite, including a torture test that pins every feedback past unity at once',
  typecheck: 'types only',
  bench: 'what the chain costs per block, stage by stage',
  blocks:
    'the distribution — p50 to p99.9, and how many blocks went over budget',
  cold: 'the first seconds, before anything has tiered up',
  ab: 'this tree against a git ref, as a paired comparison',
  soak: 'whether any stage gets slower the longer it runs',
  diagram: "re-renders the README's signal path",
  features: 'rewrites docs/features.md — this file',
  preview: 'serves the built bundle',
  format: 'prettier',
  prepare: 'points git at .githooks',
  pat: 'release: patch',
  min: 'release: minor',
  maj: 'release: major',
}

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

const range = (s: SliderDef) => {
  if (s.choices) return s.choices.join(', ')
  const unit = s.unit ? ` ${s.unit}` : ''
  return `${s.min}–${s.max}${unit}`
}

function groupSection(g: Group): string {
  const blurb = BLURBS[g.name]
  if (!blurb) {
    throw new Error(
      `no blurb for control group '${g.name}' — add one to BLURBS in scripts/features.ts`,
    )
  }
  const rows = g.sliders.map(s => `| ${s.label} | ${range(s)} |`).join('\n')
  return `### ${g.name}\n\n${blurb}\n\n| control | range |\n| --- | --- |\n${rows}\n`
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
  out.push(`<!-- Generated by \`pnpm features\`. Edit scripts/features.ts, not this file. -->

# What is in the box

An inventory, generated from the control tables so it cannot drift from them.
The [README](../README.md) explains how the interesting parts work and why they
behave as they do; this is the list, for finding out whether something exists
and what it is called.

${sliders.length} controls in ${GROUPS.length} groups, ${num(BENDS.length)} bends competing for
${num(GROUPS.find(g => g.name === 'Slot order')!.sliders.length)} slots, ${ROMS.length} ROM tunes,
${PRESETS.length} presets, and one supply rail that most of it is plugged into.
`)

  for (const place of STAGE_ORDER) {
    const groups = byPlace.get(place)!
    if (!groups.length) continue
    out.push(`## ${place}\n`)
    if (place === 'Bends') {
      out.push(
        `${num(BENDS.length)} of them for ${num(GROUPS.find(g => g.name === 'Slot order')!.sliders.length)} slots, so one always sits out — and the slots are ordered, so which comes first is yours. Each has a mix, and a mix at zero takes the stage out of the path rather than merely silencing it.\n`,
      )
    }
    for (const g of groups) out.push(groupSection(g))
  }

  out.push(`## Around the instrument

- **Presets** — ${PRESETS.map(p => `*${p.name}*`).join(', ')}.
- **Roll** randomises the board with a bias toward leaving something audible;
  controls marked \`shy\` come on rarely and low, so a roll does not bury the
  board under one effect.
- **Morph** travels between two boards over time rather than jumping.
- **The board rides in the URL**, so a link is a patch. A link never presses
  play; a reload of your own tab comes back running whatever it was running.
- **MIDI in** — notes, velocity, and knobs that map onto the panel, including
  endless encoders with lit rings.
- **Record to wav**, straight off the output.
- **A live signal-path map** that greys out whatever is not in the path.
- **Scope, meters and a rail lamp**, all fed by the meter message.

### ROM tunes

${ROMS.map(r => r.name).join(', ')}.

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
  out.push(`| command | what it does |\n| --- | --- |\n${scriptRows}\n`)

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

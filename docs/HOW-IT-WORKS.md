# How it works

The panel isn't a control library bolted onto a synth. It's a live drawing of
the actual signal path, and clicking a box on that drawing is how you open that
box's controls.

## The signal path map

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../img/chain-dark.svg">
  <img alt="Sources — the toy keyboard, the drum machine, the FM chip, the chaos oscillator, noise and the mic — sum into the mix bus, which runs into the slot rack, then through the bends themselves, the stompbox, tape delay, delay pedal, spring verb, brownout, tape machine and output, with the feedback bus wired from output back to the mix" src="../img/chain-light.svg" width="420">
</picture>

`pnpm diagram` regenerates that image with the same layout code the panel draws
with (`src/ui/chain-map.ts`) — it places the boxes and routes the wires itself
rather than handing the job to a graph library. The live version redraws as you
play: bend slots appear in the order you patched them, dead stages grey out, and
patch-bay wires ride over the top as dotted lines from source to destination.

Click a node to open its controls. Click a wire for the patch bay, or a wire's
label for whatever it's clipped onto.

**Six slots, seven bends.** You choose which six are on the board, and in what
order. The one you didn't pick isn't gone — it's drawn riding loose in the rack
at the head of the chain, dashed, soldered to nothing. Click the rack to reorder
the slots, or click the loose bend to open its own controls.

Panels that would otherwise be one long, undifferentiated list of controls — the
toy keyboard, the drum machine, the FM chip — group their advanced controls
under headings you expand on demand. A heading shows how many controls are
folded under it, or how many of those you've changed; if you've changed any, it
opens automatically, since a fold that hides something you set would be lying
about the board. Controls elsewhere on a panel appear only once they have
something to act on — a fault picks what happened to a wire, so it waits for a
wire to be cut.

Three of the chips carry a row of **named cuts**: one-click presets for the
three controls a bus fault needs set together — which wire, what happened to it,
how deep. Pressing one wires all three at once, and the row underneath then
shows which controls that was, so it doubles as a way of reading a setting as
much as a way of skipping to it.

## Sources on one rail

Sources sit at the head of the path as boxes of their own. Five of them share
one power supply: the toy keyboard, the drum machine, the FM chip, the home
keyboard and the mono synth are dies on one rail. The map draws them inside a
dashed frame with the dotted supply rail running past every box. **Starve**, a
knob on the keyboard's panel, drags that rail down, so it dives the chips' pitch
and slows the kit's tempo with it.

- **The key line:** the toy's gate line runs along the top row from the toy
  keyboard to the FM chip and the home keyboard, then drops onto the mono synth.
  All three play whatever note the toy strikes.
- **Toy gate:** each of the three has a **Toy gate** jumper. With it cut, the
  chip answers only its own keybed and any trigger bridge you patch across from
  the drums. See [the trigger patch](USER-GUIDE.md) in the user guide.
- **In the panel:** the map puts the five on two rows, with the drums under the
  toy keyboard. The README's diagram uses the same layout.

Three more sources start where they stand rather than sharing anything: the
chaos oscillator, the noise generator and the sampler. The mic isn't a source
box at all — it's drawn as a wire, landing on whichever of its seven possible
solder points **Mic patch** puts it on.

Each box carries a glyph for the machine it is and a meter for its fader level,
and lights both while something is actually coming out of it. The light comes
off the same taps on the bus the desk's meters read, so a fader at
three-quarters on a chip nothing has struck stays grey: a fader says how far up
a channel is, not whether anything is coming out of it, and the map answers the
second question rather than repeating the first.

## The mix bus

The **mix bus** is where every source lands, and it opens like any other stage:
every fader on one screen, each with its own meter reading what that channel is
actually putting on the bus — taken from the audio thread itself, not from the
knob position. The bus's own meter, underneath, is read where the faders meet
rather than at the final output, so it says which channel is eating the headroom
rather than what the limiter did about it afterward.

That's how you notice the FM chip sitting at three-quarters fader and completely
silent, because nothing on the toy has struck a note for it to play — and it is
the same reading that leaves its box on the map unlit. **Bus drive** is the
desk's own knob: the summing amp all six sources meet in, unity gain and the
first saturation stage ahead of any bend, with the feedback return landing on
the same bus — so a runaway feedback loop saturates in the same amp everything
else does.

## Real-time engine

The whole chain runs inside a single AudioWorklet `process()` call, so the
feedback loop is tight enough to squeal and every feedback path saturates
in-loop by design — runaway is a feature, held at the rails on purpose. A fixed
safety tail (DC block, soft clip, a limiter at −1 dBFS, and a NaN watchdog)
means no combination of settings can blow up the output.

How a block actually gets rendered across the main and audio threads — where the
buses sit, and what runs per sample rather than per block — is
[dataflow.md](dataflow.md). What it costs, and what was tried and thrown away to
keep it inside budget, is [optimizations.md](optimizations.md). What each fault
actually does to the circuit is [Bends](BENDS.md).

## What is stored where

Signing in puts three things on your account, and nothing else:

- **Voices:** each one a name and the board hash the address bar carries.
- **Recent sessions:** the board you last had open, one per visit and the last
  eight. Each writes a few seconds after the board stops moving and once more
  when the tab is hidden. The home page offers one back on another machine.
  Resuming a session from the home page carries on writing to it; any other
  visit starts a new one.
- **Setup:** the bench layout, the morph time and the remapped computer keys.
  `src/ui/useSyncedPrefs.ts` keeps it. Every change stamps a clock on this
  machine, and on sign-in the newer side wins.

Everything else stays on the device it was set on, in `localStorage` — MIDI knob
and pad maps, whether the machines were running — because it is a fact about
this machine rather than about the music. The undo walk is a fact about this tab
and goes when the tab does.

Signed out, none of the Firebase SDK is fetched at all: the imports in
`src/ui/cloud.ts` are dynamic and gated on a localStorage hint saying this
browser has signed in before, so a session that never signs in downloads none of
it.

bender shares a Firebase project with
[videoskillet.js](https://github.com/cmdcolin/videoskillet) and keeps its own
data under `benderUsers/{uid}`. The rules for that collection are deployed from
the videoskillet repository's `firestore.rules`; there is no rules file here.

The setup lives under `prefs` in the same document. A change to `prefs` needs
the rules deployed first; a write the rules refuse fails quietly and the setup
stays on this machine. The write uses `mergeFields`, because a plain merge joins
nested maps and keeps keys the player removed.

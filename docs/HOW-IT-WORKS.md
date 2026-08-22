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

Sources sit at the head of the path as boxes of their own. Three of them share
one power supply: the toy keyboard, the drum machine and the FM chip are three
dies on one rail, drawn inside a dashed frame with **Starve** — a knob on the
keyboard's panel — running across the top of it, because starving the rail dives
the FM chip's pitch and drags the kit's tempo down with it.

The FM chip has no keyboard or sequencer of its own. Its key input is soldered
onto the toy's gate line, so it hangs under the keyboard on the diagram and
plays whatever note the toy strikes, unless you patch a trigger bridge across
the lane between them yourself — see [the trigger patch](USER-GUIDE.md) in the
user guide.

Three more sources start where they stand rather than sharing anything: the
chaos oscillator, the noise generator and the sampler. The mic isn't a source
box at all — it's drawn as a wire, landing on whichever of its seven possible
solder points **Mic patch** puts it on.

Each box carries a glyph for the machine it is, a meter for its fader level,
and, on the two sources with a run switch, a light that only comes on while
something is actually playing. That distinction matters: a fader says how far up
a channel is, not whether anything is coming out of it.

## The mix bus

The **mix bus** is where every source lands, and it opens like any other stage:
every fader on one screen, each with its own meter reading what that channel is
actually putting on the bus — taken from the audio thread itself, not from the
knob position. The bus's own meter, underneath, is read where the faders meet
rather than at the final output, so it says which channel is eating the headroom
rather than what the limiter did about it afterward.

That's how you notice the FM chip sitting at three-quarters fader and completely
silent, because nothing on the toy has struck a note for it to play. **Bus
drive** is the desk's own knob: the summing amp all six sources meet in, unity
gain and the first saturation stage ahead of any bend, with the feedback return
landing on the same bus — so a runaway feedback loop saturates in the same amp
everything else does.

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

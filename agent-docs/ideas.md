- Knob automation — the assistant-suggested one you'd blessed. Needs an arm
  affordance, a control-rate recorder, transport-locked playback, and a real
  decision about whether a recorded sweep rides in presets/URL/undo. The patch
  bay can't host it: its 50 destinations are DSP lanes, not the 331 control
  keys.
- The agent interface — your idea, scoped in agent-docs/agent-interface.md.
  engine.ts already has patch/morphTo/meter as real methods, so the facade is
  genuinely thin; the note codec and param manifest are the cheap parts. Your
  instinct to hold off seems right to me while nothing's driving it.
- The other 17 log knobs are sticky and I'd leave them. It's structural, not a
  bug: equal travel per decade against an absolute step puts ~10 values across
  ~40% of the track (revDecayS parks 89 positions on 0.2). Fixing it needs a
  relative step — a new concept in SliderDef — and would rescale packed links
  for all 17. sampleSpeed was worth it because its band was a dead value at the
  end you reach for.
- Further FM chip bends — ranked with hook points in agent-docs/fm-bends.md.
  Three have landed: the sine table's output pins, the shift register soldered
  onto them, and the bay's reach onto the chip. What is left is the instrument
  ROM's own bus (cheapest), the two clocks (buys the most — the missing bottom
  octave is down the chip's crystal), rhythm at full width with the DAC's slot
  counter beside it, and log domain, which stays last and stays the one to be
  suspicious of: it changes how the chip sounds with no knife on it at all.
- Further drum machine bends — ranked with hook points in
  agent-docs/drum-bends.md. The framing that came out of writing it: unlike the
  FM chip the kit has no dead wires (40/40 and 20/20 audible on
  `pnpm spectrum kit`), so "does this wire do anything" is settled and the gaps
  are elsewhere — nothing on the kit accumulates, the step counter has no fault
  surface at all, and every voice sees one supply where the toy keyboard's
  voices see two. The cheap top of the list is a slipping step clock and a
  supply for the metal bank; the large one is the pattern as a circulating shift
  register, and it is large because of the worklet→control writeback rather than
  the DSP.
- verb comb modulation to break up the static tail at very long decays, tape
  dropouts, and a pitch-shifting echo mode.

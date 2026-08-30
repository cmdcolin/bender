- Knob automation — the assistant-suggested one you'd blessed. Needs an arm
  affordance, a control-rate recorder, transport-locked playback, and a real
  decision about whether a recorded sweep rides in presets/URL/undo. The patch
  bay can't host it: its 25 destinations are DSP lanes, not the 331 control
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
- Further FM chip bends — ranked with hook points in agent-docs/fm-bends.md,
  written after the dead-bit pass landed and re-ranked once `pnpm spectrum`
  learned to measure the chip in more than one mode. The shift register is the
  whole story: it is the chip's only broadband source, it is gated behind the
  percussion bank, and taking that gate off is both the cheapest item on the
  list and the only one whose payoff is already measured. Log domain is the
  large one and the one to be suspicious of — it changes how the chip sounds
  with no knife on it at all.

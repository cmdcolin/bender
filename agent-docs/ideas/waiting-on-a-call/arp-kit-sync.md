---
name: arp-kit-sync
description:
  Lock the toy's arpeggiator to the kit's tempo the way Kit sync locks the
  tune; waits on whether chipArpHz may become a division of the beat.
---

# Arpeggiator on Kit sync

Kit sync (`chipSync`) replaces the tune's step rate only. `ToyChip.process`
advances the arpeggiator at `chipArpHz * timing`, so the arp ignores the lock.

To lock it, the arp needs its own ratio to the kit's beat, and `chipArpHz`
would change from a rate in Hz to a division. The open question is whether the
knob should change meaning.

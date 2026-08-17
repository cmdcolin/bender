// The ROM sequencer's run/stop line, shared by the toy chip and the toy drums.
// Nothing plays itself until the user presses play; the keys always work.
export class Transport {
  playing = false
}

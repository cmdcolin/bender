// The run/stop lines. Two of them, because the toy keyboard and the drum box
// are two machines sharing a desk and a power strip, not one: the kit runs under
// your own playing, or on its own, or with the tune, and the tune does not need
// the kit. They share the rail and nothing else — starving the toy still takes
// the drums down with it, which is a fact about the supply rather than about who
// is running.
//
// Neither plays itself until the user presses play; the keys always work.
export class Transport {
  tune = false
  drums = false
}

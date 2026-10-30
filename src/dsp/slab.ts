// A stereo pair of slabs filled a block at a time and posted whole. A slab
// always ends where a block ends when its length is a whole number of blocks,
// so the copy runs once for every block the host asks for in full. It goes
// round twice for a short block that straddles the seam, which is the case
// that has to be right rather than fast.
export interface Slab {
  l: Float32Array
  r: Float32Array
  fill: number
}

export const slab = (frames: number): Slab => ({
  l: new Float32Array(frames),
  r: new Float32Array(frames),
  fill: 0,
})

/** Mono tracks laid beside the pair: `from` holds one block per track,
    `block` frames apart, and `into` one slab per track. */
export interface Tracks {
  from: Float32Array
  block: number
  into: Float32Array[]
}

// The block onto the slab, in whatever piece of it fits before the slab is
// full, calling `full` each time it is.
export function pour(
  into: Slab,
  l: Float32Array,
  r: Float32Array,
  n: number,
  tracks: Tracks | null,
  full: () => void,
) {
  const size = into.l.length
  let at = 0
  while (at < n) {
    const take = Math.min(n - at, size - into.fill)
    const fill = into.fill
    for (let i = 0; i < take; i++) {
      into.l[fill + i] = l[at + i]!
      into.r[fill + i] = r[at + i]!
    }
    if (tracks) {
      for (let k = 0; k < tracks.into.length; k++) {
        const track = tracks.into[k]!
        const base = k * tracks.block + at
        for (let i = 0; i < take; i++) track[fill + i] = tracks.from[base + i]!
      }
    }
    into.fill = fill + take
    at += take
    if (into.fill === size) full()
  }
}

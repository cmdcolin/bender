/** `splice(at, 1)` without the array of what it took out, which is garbage on
    the audio thread. Keeps the order of what is left. */
export function removeAt(list: number[], at: number) {
  list.copyWithin(at, at + 1)
  list.pop()
}

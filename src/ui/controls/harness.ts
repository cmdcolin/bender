const HARNESS =
  'One hole along, reversed and bounce take every wire from the lowest up to the chosen one. One hole along rotates them up a wire, reversed mirrors them, and bounce lifts them all high on each word where several wires fall at once.'

export const withHarness = (help: string) => `${help} ${HARNESS}`

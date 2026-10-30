/** Each stage's old name, mapped to the name it has carried since 2026-10-18. */
export const RENAMED = new Map<string, string>([
  ['Toy keyboard', 'Plinky'],
  ['Toy drums', 'Clatter'],
  ['FM chip', 'Glint'],
  ['Home keyboard', 'Parlor'],
  ['Mono synth', 'Growler'],
  ['Tape loop', 'Spool'],
  ['Four-track', 'Layercake'],
  ['Stompbox', 'Gnash'],
  ['Tape delay', 'Wraith'],
  ['Delay pedal', 'Ricochet'],
  ['Spring verb', 'Boing'],
  ['Ensemble', 'Chorale'],
  ['Tube amp', 'Ember'],
])

const FORMER = new Map(
  [...RENAMED].map(([was, now]) => [now, was.toLowerCase()]),
)

/** What a renamed stage used to be called, in lower case. */
export const formerName = (stage: string) => FORMER.get(stage)

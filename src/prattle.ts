import type { ControlKey, Controls } from './controls.ts'

// Prattle's vocabulary: the allophones its ROM holds, the words it knows, and
// the phrase memory a board carries them in.

export const ALLOPHONES = [
  'PA',
  'PA2',
  'IY',
  'IH',
  'EH',
  'AE',
  'AA',
  'AH',
  'AO',
  'UH',
  'UW',
  'ER',
  'AX',
  'EY',
  'AY',
  'OY',
  'AW',
  'OW',
  'YU',
  'L',
  'R',
  'W',
  'Y',
  'M',
  'N',
  'NG',
  'F',
  'TH',
  'S',
  'SH',
  'HH',
  'V',
  'DH',
  'Z',
  'ZH',
  'P',
  'T',
  'K',
  'B',
  'D',
  'G',
  'CH',
  'JH',
  'DX',
  'EL',
  'AR',
  'OR',
  'EHR',
  'UX',
  'IX',
  'WH',
  'PP',
  'TT',
  'KK',
] as const

export type Allophone = (typeof ALLOPHONES)[number]

const CODE = new Map<string, number>(ALLOPHONES.map((a, i) => [a, i]))

// A phrase is up to PHRASE_LEN words of the memory: 0 is empty, an allophone
// is its index plus one, and two codes mark where a word or a syllable ends.
export const PHRASE_LEN = 32
export const PH_EMPTY = 0
export const PH_SYL = 62
export const PH_WORD = 63
export const PH_MAX = 63

export const PHRASE_KEYS = [
  'talkPh0',
  'talkPh1',
  'talkPh2',
  'talkPh3',
  'talkPh4',
  'talkPh5',
  'talkPh6',
  'talkPh7',
  'talkPh8',
  'talkPh9',
  'talkPh10',
  'talkPh11',
  'talkPh12',
  'talkPh13',
  'talkPh14',
  'talkPh15',
  'talkPh16',
  'talkPh17',
  'talkPh18',
  'talkPh19',
  'talkPh20',
  'talkPh21',
  'talkPh22',
  'talkPh23',
  'talkPh24',
  'talkPh25',
  'talkPh26',
  'talkPh27',
  'talkPh28',
  'talkPh29',
  'talkPh30',
  'talkPh31',
] as const satisfies readonly ControlKey[]

export const PHRASE_KEY_SET = new Set<ControlKey>(PHRASE_KEYS)

export const asPhraseCode = (v: number) => {
  const n = Math.round(v)
  return n >= 0 && n <= PH_MAX && (n <= ALLOPHONES.length || n >= PH_SYL)
    ? n
    : PH_EMPTY
}

// Syllables split with '-'. The vowels a hit lands on are the ones a word is
// spelt with, so a split word speaks over two hits.
const WORDS: Record<string, string> = {
  zero: 'Z IY - R OW',
  one: 'W AH N',
  two: 'T UW',
  three: 'TH R IY',
  four: 'F OR',
  five: 'F AY V',
  six: 'S IH K S',
  seven: 'S EH - V AX N',
  eight: 'EY TT',
  nine: 'N AY N',
  ten: 'T EH N',
  eleven: 'IX - L EH - V AX N',
  twelve: 'T W EH L V',
  bass: 'B EY S',
  kick: 'K IH KK',
  drop: 'D R AA PP',
  noise: 'N OY Z',
  acid: 'AE - S IH D',
  dance: 'D AE N S',
  machine: 'M AX - SH IY N',
  error: 'EHR - ER',
  reboot: 'R IY - B UW TT',
  again: 'AX - G EH N',
  kill: 'K IH L',
  the: 'DH AX',
  go: 'G OW',
  move: 'M UW V',
  body: 'B AA - DX IY',
  your: 'Y OR',
  jack: 'JH AE KK',
  techno: 'T EH K - N OW',
  house: 'HH AW S',
  hard: 'HH AR D',
  harder: 'HH AR - D ER',
  rave: 'R EY V',
  more: 'M OR',
  louder: 'L AW - D ER',
  faster: 'F AE S - T ER',
  system: 'S IH S - T AX M',
  failure: 'F EY L - Y ER',
  warning: 'W OR - N IH NG',
  alert: 'AX - L ER TT',
  danger: 'D EY N - JH ER',
  robot: 'R OW - B AA TT',
  human: 'HH YU - M AX N',
  voice: 'V OY S',
  speak: 'S P IY KK',
  talk: 'T AO KK',
  stop: 'S T AA PP',
  start: 'S T AR TT',
  loop: 'L UW PP',
  repeat: 'R IY - P IY TT',
  destroy: 'D IX - S T R OY',
  control: 'K AX N - T R OW L',
  power: 'P AW - ER',
  down: 'D AW N',
  up: 'AH PP',
  in: 'IH N',
  out: 'AW TT',
  on: 'AA N',
  off: 'AO F',
  yes: 'Y EH S',
  no: 'N OW',
  i: 'AY',
  am: 'AE M',
  is: 'IH Z',
  it: 'IH TT',
  a: 'AX',
  you: 'Y UW',
  we: 'W IY',
  me: 'M IY',
  my: 'M AY',
  all: 'AO L',
  now: 'N AW',
  time: 'T AY M',
  beat: 'B IY TT',
  break: 'B R EY KK',
  hit: 'HH IH TT',
  snare: 'S N EHR',
  hat: 'HH AE TT',
  clap: 'K L AE PP',
  sound: 'S AW N D',
  signal: 'S IH G - N EL',
  circuit: 'S ER - K IH TT',
  bend: 'B EH N D',
  bender: 'B EH N - D ER',
  prattle: 'P R AE - DX EL',
  hello: 'HH EH - L OW',
  pump: 'P AH M PP',
  crash: 'K R AE SH',
  glitch: 'G L IH CH',
  static: 'S T AE - DX IH KK',
  freak: 'F R IY KK',
  freaky: 'F R IY - K IY',
  weird: 'W IY R D',
  mutant: 'M YU - T AX N TT',
  mutate: 'M YU - T EY TT',
  everybody: 'EH - V R IY - B AA - DX IY',
  ready: 'R EH - DX IY',
  set: 'S EH TT',
  level: 'L EH - V EL',
  volume: 'V AA L - Y UW M',
  minus: 'M AY - N AX S',
  plus: 'P L AH S',
  dead: 'D EH D',
  fire: 'F AY - ER',
  burn: 'B ER N',
  feel: 'F IY L',
  love: 'L AH V',
  this: 'DH IH S',
  that: 'DH AE TT',
  what: 'WH AH TT',
  here: 'HH IY R',
  run: 'R AH N',
  low: 'L OW',
  high: 'HH AY',
  bit: 'B IH TT',
  data: 'D EY - DX AX',
  memory: 'M EH - M ER - IY',
  overload: 'OW - V ER - L OW D',
  shut: 'SH AH TT',
  mouth: 'M AW TH',
  scream: 'S K R IY M',
  chant: 'CH AE N TT',
}

export const DICTIONARY_WORDS = Object.keys(WORDS)

const VOWEL_PHONES = new Set<string>([
  'IY',
  'IH',
  'EH',
  'AE',
  'AA',
  'AH',
  'AO',
  'UH',
  'UW',
  'ER',
  'AX',
  'EY',
  'AY',
  'OY',
  'AW',
  'OW',
  'YU',
  'EL',
  'AR',
  'OR',
  'EHR',
  'UX',
  'IX',
])

// Longest spelling first, so 'tion' wins over 't'.
const SPELLINGS: readonly (readonly [string, string])[] = [
  ['tion', 'SH AX N'],
  ['igh', 'AY'],
  ['sch', 'S K'],
  ['ck', 'K'],
  ['sh', 'SH'],
  ['ch', 'CH'],
  ['th', 'TH'],
  ['ph', 'F'],
  ['wh', 'WH'],
  ['ng', 'NG'],
  ['qu', 'K W'],
  ['ee', 'IY'],
  ['ea', 'IY'],
  ['ie', 'IY'],
  ['oo', 'UW'],
  ['ou', 'AW'],
  ['ow', 'OW'],
  ['oa', 'OW'],
  ['ai', 'EY'],
  ['ay', 'EY'],
  ['ey', 'EY'],
  ['oi', 'OY'],
  ['oy', 'OY'],
  ['au', 'AO'],
  ['aw', 'AO'],
  ['ue', 'UW'],
  ['ew', 'YU'],
  ['er', 'ER'],
  ['ir', 'ER'],
  ['ur', 'ER'],
  ['ar', 'AR'],
  ['or', 'OR'],
  ['a', 'AE'],
  ['b', 'B'],
  ['c', 'K'],
  ['d', 'D'],
  ['e', 'EH'],
  ['f', 'F'],
  ['g', 'G'],
  ['h', 'HH'],
  ['i', 'IH'],
  ['j', 'JH'],
  ['k', 'K'],
  ['l', 'L'],
  ['m', 'M'],
  ['n', 'N'],
  ['o', 'AA'],
  ['p', 'P'],
  ['q', 'K'],
  ['r', 'R'],
  ['s', 'S'],
  ['t', 'T'],
  ['u', 'AH'],
  ['v', 'V'],
  ['w', 'W'],
  ['x', 'K S'],
  ['y', 'IY'],
  ['z', 'Z'],
]

const LONG: Record<string, string> = {
  a: 'EY',
  e: 'IY',
  i: 'AY',
  o: 'OW',
  u: 'YU',
}

const isVowelLetter = (ch: string | undefined) =>
  ch !== undefined && 'aeiou'.includes(ch)

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
]

/** A word it has no entry for, spelt out letter by letter into something. */
export function soundOut(word: string): string[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  const magic =
    w.length > 2 &&
    w.endsWith('e') &&
    !isVowelLetter(w[w.length - 2]) &&
    isVowelLetter(w[w.length - 3]) &&
    !isVowelLetter(w[w.length - 4])
  const body = w.length > 2 && w.endsWith('e') ? w.slice(0, -1) : w
  const out: string[] = []
  let i = 0
  while (i < body.length) {
    const ch = body[i]!
    const soft = ch === 'c' && 'eiy'.includes(body[i + 1] ?? '')
    const lead = ch === 'y' && i === 0
    const long = magic && i === body.length - 2 ? LONG[ch] : undefined
    const doubled = ch === body[i - 1] && !isVowelLetter(ch)
    const spelt = SPELLINGS.find(([s]) => body.startsWith(s, i))!
    const phones = soft
      ? 'S'
      : lead
        ? 'Y'
        : long || (ch === 'y' && i > 0 && i === body.length - 1)
          ? (long ?? 'IY')
          : spelt[1]
    if (!doubled) out.push(...phones.split(' '))
    i += soft || lead || long ? 1 : spelt[0].length
  }
  return syllabify(out)
}

// A split before the last consonant between two vowels.
function syllabify(phones: string[]): string[] {
  const out: string[] = []
  let seenVowel = false
  let since = 0
  for (const ph of phones) {
    const vowel = VOWEL_PHONES.has(ph)
    if (vowel && seenVowel) out.splice(out.length - Math.min(since, 1), 0, '-')
    out.push(ph)
    seenVowel ||= vowel
    since = vowel ? 0 : since + 1
  }
  return out
}

export function wordPhones(word: string): string[] {
  const w = word.toLowerCase()
  const known = WORDS[w]
  return known ? known.split(' ') : soundOut(w)
}

const splitWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/[0-9]/g, d => ` ${NUMBER_WORDS[Number(d)]} `)
    .split(/[^a-z']+/)
    .map(w => w.replace(/'/g, ''))
    .filter(w => w.length > 0)

/** Text as the phrase memory holds it, after whatever `before` holds: whole
    words, as many as fit. */
export function textToPhrase(
  text: string,
  before: readonly number[] = [],
): number[] {
  const codes = before.filter(c => c !== PH_EMPTY)
  for (const word of splitWords(text)) {
    const phones = wordPhones(word).map(ph =>
      ph === '-' ? PH_SYL : (CODE.get(ph) ?? -1) + 1,
    )
    const fits = codes.length + phones.length + 1 <= PHRASE_LEN
    if (fits && phones.length > 0)
      codes.push(...phones.filter(c => c > 0), PH_WORD)
  }
  return [...codes, ...Array<number>(PHRASE_LEN - codes.length).fill(PH_EMPTY)]
}

const PHONES_OF = new Map(
  Object.entries(WORDS).map(([word, phones]) => [
    phones.replace(/ - /g, ' ').trim(),
    word,
  ]),
)

const tokenOf = (c: number) =>
  c === PH_SYL ? '-' : c > 0 && c <= ALLOPHONES.length ? ALLOPHONES[c - 1]! : ''

/** The phrase memory read back: a word the dictionary spells exactly that
    way by name, any other in brackets as its allophones. */
export function phraseText(codes: readonly number[]): string {
  const words: string[][] = [[]]
  for (const c of codes) {
    if (c === PH_WORD) words.push([])
    else if (tokenOf(c) !== '') words[words.length - 1]!.push(tokenOf(c))
  }
  return words
    .filter(w => w.some(t => t !== '-'))
    .map(w => {
      const phones = w.filter(t => t !== '-').join(' ')
      return PHONES_OF.get(phones) ?? `[${w.join(' ')}]`
    })
    .join(' ')
}

/** The phrase memory's controls, holding `text`. */
export const phraseControls = (
  text: string,
  before: readonly number[] = [],
): Partial<Controls> =>
  Object.fromEntries(
    textToPhrase(text, before).map((c, i) => [PHRASE_KEYS[i]!, c]),
  )

/** The phrase memory as the board holds it. */
export const phraseOf = (c: Controls) => PHRASE_KEYS.map(k => c[k])

/** What a phrase is said as with nothing in the memory: the chip counting. */
export const DEMO_PHRASE = textToPhrase('one two three four')

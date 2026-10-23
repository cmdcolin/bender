import { PARTS, type PartDef, type PartType } from './parts.ts'

export type Sheet = 'power' | 'sequencer' | 'keys' | 'voice' | 'output'

export const SHEETS: { id: Sheet; title: string }[] = [
  { id: 'power', title: 'Power and clock' },
  { id: 'sequencer', title: 'Tempo, step counter and tune ROM' },
  { id: 'keys', title: 'Keys, note select and latch' },
  { id: 'voice', title: 'Pitch divider and tone' },
  { id: 'output', title: 'Envelope, level and speaker' },
]

export interface Placed {
  ref: string
  type: PartType
  def: PartDef
  value: string
  sheet: Sheet
  conn: Map<string, string>
  closed: [string, string][]
  note?: string
  decouples?: string
}

export type Closed = [string, string][]

export class Board {
  readonly parts = new Map<string, Placed>()
  private sheet: Sheet = 'power'
  private decouple = 100

  on(sheet: Sheet) {
    this.sheet = sheet
  }

  add(
    ref: string,
    type: PartType,
    conn: Record<string, string> = {},
    opts: { value?: string; closed?: Closed; note?: string } = {},
  ) {
    if (this.parts.has(ref)) throw new Error(`duplicate ${ref}`)
    const def: PartDef = PARTS[type]
    const wired = new Map<string, string>()
    for (const pin of def.pins) {
      const net = conn[pin.name]
      if (net !== undefined) wired.set(pin.name, net)
      else if (pin.dir === 'v')
        wired.set(
          pin.name,
          pin.name === 'GND' || pin.name === 'VSS' ? 'GND' : 'VCC',
        )
      else if (pin.tie) wired.set(pin.name, pin.tie)
    }
    for (const name of Object.keys(conn))
      if (!def.pins.some(p => p.name === name))
        throw new Error(`${ref} (${type}) has no pin ${name}`)
    this.parts.set(ref, {
      ref,
      type,
      def,
      value: opts.value ?? def.value,
      sheet: this.sheet,
      conn: wired,
      closed: opts.closed ?? (type === 'SJ' ? [['1', '2']] : []),
      note: opts.note,
    })
    if (!def.passive && def.pins.some(p => p.dir === 'v')) {
      const cap = `C${this.decouple++}`
      this.part(cap, 'C', { 1: 'VCC', 2: 'GND' }, '100n')
      this.parts.get(cap)!.decouples = ref
    }
  }

  part(
    ref: string,
    type: PartType,
    conn: Record<string, string>,
    value?: string,
  ) {
    this.add(ref, type, conn, { value })
  }

  pad(net: string) {
    this.add(`TP_${net}`, 'PAD', { 1: net }, { value: net })
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

export const KEY_COUNT = 12

export function buildBoard(): Board {
  const b = new Board()

  b.on('power')
  b.part('BT1', 'BT', { 1: 'VBAT', 2: 'GND' })
  b.part('J1', 'JACK', { TIP: 'VJACK', SLEEVE: 'GND' }, '5 V in')
  b.part('SW2', 'SPDT', { A: 'VBAT', COM: 'VSRC', B: 'VJACK' }, 'cells / jack')
  b.part('SW1', 'SLIDE', { 1: 'VSRC', 2: 'VRAW' }, 'power')
  b.part(
    'RV1',
    'POT',
    { CCW: 'VRAW', WIPER: 'VCC', CW: 'VCC' },
    '100R 1W starve',
  )
  b.part('C1', 'CPB', { 1: 'VCC', 2: 'GND' }, '470u')
  b.add('U1', '74HC14', {
    '1A': 'CLK_RC',
    '1Y': 'CLK_RAW',
    '2A': 'CLK_RAW',
    '2Y': 'MCLK',
  })
  b.part('R1', 'R', { 1: 'CLK_RAW', 2: 'CLK_R' }, '1k')
  b.part(
    'RV2',
    'POT',
    { CCW: 'CLK_R', WIPER: 'CLK_RC', CW: 'CLK_RC' },
    '5k clock',
  )
  b.part('C2', 'C', { 1: 'CLK_RC', 2: 'GND' }, '100p')
  for (const net of ['MCLK', 'CLK_RC', 'VCC']) b.pad(net)

  b.on('sequencer')
  b.add('U2', '74HC4040', { CLK: 'MCLK', RST: 'GND', Q12: 'DIV12' })
  b.add('U3', '74HC4040', {
    CLK: 'DIV12',
    RST: 'GND',
    Q6: 'T18',
    Q7: 'T19',
    Q8: 'T20',
    Q9: 'T21',
  })
  b.add(
    'SW3',
    'SP4T',
    { COM: 'STEP', T0: 'T18', T1: 'T19', T2: 'T20', T3: 'T21' },
    { value: 'tempo', closed: [['COM', 'T2']] },
  )
  b.add('U4', '74HC4040', {
    CLK: 'STEP',
    RST: 'LOOP_RST',
    Q1: 'STEP0',
    Q2: 'STEP1',
    Q3: 'STEP2',
    Q4: 'STEP3',
    Q5: 'STEP4',
  })
  b.part('C3', 'C', { 1: 'VCC', 2: 'LOOP_RST' }, '100n')
  b.part('R2', 'R', { 1: 'LOOP_RST', 2: 'GND' }, '10k')
  b.add(
    'SW4',
    'SEL7',
    {
      COM: 'LOOP_RST',
      ...Object.fromEntries(range(6).map(i => [`T${i}`, `TD${i}`])),
      T6: 'GND',
    },
    { value: 'loop', note: 'bridge COM to a data line to cut the tune short' },
  )
  range(5).forEach(i =>
    b.part(`SJ${i + 1}`, 'SJ', { 1: `STEP${i}`, 2: `RA${i}` }, `A${i}`),
  )
  b.add(
    'U5',
    'AT28C64B',
    {
      ...Object.fromEntries(range(5).map(i => [`A${i}`, `RA${i}`])),
      ...Object.fromEntries(range(5).map(i => [`A${i + 5}`, `BANK${i}`])),
      ...Object.fromEntries(range(6).map(i => [`D${i}`, `RD${i}`])),
      WEn: 'VCC',
    },
    { value: 'AT28C64B tunes' },
  )
  range(6).forEach(i =>
    b.part(`SJ${i + 6}`, 'SJ', { 1: `RD${i}`, 2: `TD${i}` }, `D${i}`),
  )
  b.add(
    'SW5',
    'DIP5',
    {
      ...Object.fromEntries(range(5).map(i => [String(i + 1), 'VCC'])),
      ...Object.fromEntries(range(5).map(i => [String(10 - i), `BANK${i}`])),
    },
    { value: 'tune bank' },
  )
  b.part('RN1', 'RN6', {
    COM: 'GND',
    ...Object.fromEntries(range(5).map(i => [String(i + 2), `BANK${i}`])),
  })
  for (const net of ['STEP', 'T20']) b.pad(net)

  b.on('keys')
  range(KEY_COUNT).forEach(i =>
    b.part(`K${i}`, 'KEY', { 1: `KEY${i}`, 2: 'GND' }, `key ${i}`),
  )
  b.part('RN2', 'RN9', {
    COM: 'VCC',
    ...Object.fromEntries(range(8).map(i => [String(i + 2), `KEY${i}`])),
  })
  b.part('RN3', 'RN5', {
    COM: 'VCC',
    ...Object.fromEntries(range(4).map(i => [String(i + 2), `KEY${i + 8}`])),
  })
  b.add('U7', '74HC148', {
    I0: 'KEY8',
    I1: 'KEY9',
    I2: 'KEY10',
    I3: 'KEY11',
    I4: 'VCC',
    I5: 'VCC',
    I6: 'VCC',
    I7: 'VCC',
    EI: 'GND',
    A0: 'AH0',
    A1: 'AH1',
    A2: 'AH2',
    GS: 'GSH',
    EO: 'EOH',
  })
  b.add('U6', '74HC148', {
    ...Object.fromEntries(range(8).map(i => [`I${i}`, `KEY${i}`])),
    EI: 'EOH',
    A0: 'AL0',
    A1: 'AL1',
    A2: 'AL2',
    GS: 'GSL',
  })
  b.add('U8', '74HC00', {
    '1A': 'AH0',
    '1B': 'AL0',
    '1Y': 'KS0',
    '2A': 'AH1',
    '2B': 'AL1',
    '2Y': 'KS1',
    '3A': 'AH2',
    '3B': 'AL2',
    '3Y': 'KS2',
    '4A': 'GSH',
    '4B': 'GSH',
    '4Y': 'KS3',
  })
  b.add('U11', '74HC00', {
    '1A': 'GSH',
    '1B': 'GSL',
    '1Y': 'KANY',
    '2A': 'MC3',
    '2B': 'MC2',
    '2Y': 'SPn',
  })
  b.add(
    'SW6',
    'DIP2',
    { 1: 'VCC', 2: 'VCC', 4: 'OCT0', 3: 'OCT1' },
    { value: 'octave' },
  )
  b.part('RN4', 'RN3', { COM: 'GND', 2: 'OCT0', 3: 'OCT1' })
  b.add('U9', '74HC157', {
    SEL: 'KANY',
    '1A': 'TD0',
    '1B': 'KS0',
    '1Y': 'MC0',
    '2A': 'TD1',
    '2B': 'KS1',
    '2Y': 'MC1',
    '3A': 'TD2',
    '3B': 'KS2',
    '3Y': 'MC2',
    '4A': 'TD3',
    '4B': 'KS3',
    '4Y': 'MC3',
  })
  b.add('U10', '74HC157', {
    SEL: 'KANY',
    '1A': 'TD4',
    '1B': 'OCT0',
    '1Y': 'MC4',
    '2A': 'TD5',
    '2B': 'OCT1',
    '2Y': 'MC5',
  })
  b.add('U12', '74HC02', { '1A': 'SPn', '1B': 'MC0', '1Y': 'REST' })
  b.add('U13', '74HC08', {
    '1A': 'STEP',
    '1B': 'SPn',
    '1Y': 'NOTEX',
    '2A': 'STEP',
    '2B': 'REST',
    '2Y': 'KILL',
  })
  b.add('U14', '74HC32', { '1A': 'NOTEX', '1B': 'KANY', '1Y': 'G' })
  b.add('U15', '74HC573', {
    ...Object.fromEntries(range(6).map(i => [`D${i}`, `MC${i}`])),
    ...Object.fromEntries(range(6).map(i => [`Q${i}`, `LC${i}`])),
    LE: 'G',
  })
  for (const net of ['G', 'KANY']) b.pad(net)

  b.on('voice')
  b.add(
    'U16',
    'AT28C64B',
    {
      ...Object.fromEntries(range(4).map(i => [`A${i}`, `LC${i}`])),
      ...Object.fromEntries(range(8).map(i => [`D${i}`, `PRE${i}`])),
      WEn: 'VCC',
    },
    { value: 'AT28C64B semitones' },
  )
  b.add('U21', '74HC161', {
    MRn: 'VCC',
    CP: 'MCLK',
    CEP: 'VCC',
    PEn: 'LOADn',
    CET: 'VCC',
    TC: 'TCL',
    P0: 'PRE0',
    P1: 'PRE1',
    P2: 'PRE2',
    P3: 'PRE3',
  })
  b.add('U22', '74HC161', {
    MRn: 'VCC',
    CP: 'MCLK',
    CEP: 'VCC',
    PEn: 'LOADn',
    CET: 'TCL',
    TC: 'TCP',
    P0: 'PRE4',
    P1: 'PRE5',
    P2: 'PRE6',
    P3: 'PRE7',
  })
  b.add('U23', '74HC04', { '1A': 'TCP', '1Y': 'LOADn' })
  b.add('U18', '74HC393', {
    '1CP': 'TCP',
    '1Q0': 'OD2',
    '1Q1': 'OD4',
    '1Q2': 'OD8',
    '2CP': 'OCTCLK',
    '2Q0': 'DQ0',
    '2Q1': 'DQ1',
    '2Q2': 'DQ2',
    '2Q3': 'DQ3',
  })
  b.add(
    'U17',
    '74HC153',
    {
      S0: 'LC4',
      S1: 'LC5',
      '1I3': 'TCP',
      '1I2': 'OD2',
      '1I1': 'OD4',
      '1I0': 'OD8',
      '1Y': 'OCTCLK',
      '2En': 'VCC',
    },
    { value: '74HC153 octave' },
  )
  b.add('U19', '74HC08', {
    '1A': 'DQ3',
    '1B': 'DQ2',
    '1Y': 'D25',
    '2A': 'D25',
    '2B': 'DQ1',
    '2Y': 'D12',
    '3A': 'D12',
    '3B': 'DQ0',
    '3Y': 'D6',
  })
  b.add(
    'U20',
    '74HC153',
    {
      S0: 'TONE0',
      S1: 'TONE1',
      '1En': 'VCC',
      '2I0': 'DQ3',
      '2I1': 'D25',
      '2I2': 'D12',
      '2I3': 'D6',
      '2Y': 'PULSE',
    },
    { value: '74HC153 tone' },
  )
  b.add(
    'SW7',
    'DIP2',
    { 1: 'VCC', 2: 'VCC', 4: 'TONE0', 3: 'TONE1' },
    { value: 'tone' },
  )
  b.part('RN5', 'RN3', { COM: 'GND', 2: 'TONE0', 3: 'TONE1' })
  for (const net of ['TCP', 'OCTCLK', 'PULSE']) b.pad(net)
  range(8).forEach(i => b.pad(`PRE${i}`))

  b.on('output')
  b.part('D1', 'D', { A: 'G', K: 'ATT' }, '1N5819')
  b.part('R3', 'R', { 1: 'ATT', 2: 'ENV' }, '1k')
  b.part('C4', 'CF', { 1: 'ENV', 2: 'GND' }, '1u')
  b.part('RV3', 'POT', { CCW: 'ENV', WIPER: 'ENV_D', CW: 'ENV_D' }, '1M decay')
  b.part('R4', 'R', { 1: 'ENV_D', 2: 'GND' }, '10k')
  b.add('U24', '74HC4066', {
    '2A': 'ENV',
    '2B': 'GND',
    '2C': 'KILL',
    '3A': 'ENVB',
    '3B': 'SIG',
    '3C': 'PULSE',
  })
  b.add('U25', 'MCP6002', {
    INAp: 'ENV',
    INAn: 'ENVB',
    OUTA: 'ENVB',
    INBn: 'OUTB',
    OUTB: 'OUTB',
  })
  b.part('R5', 'R', { 1: 'SIG', 2: 'GND' }, '10k')
  b.part('C5', 'CF', { 1: 'SIG', 2: 'SIGAC' }, '1u')
  b.part(
    'RV4',
    'POT',
    { CW: 'SIGAC', WIPER: 'AMPIN', CCW: 'GND' },
    '10k log level',
  )
  b.part('R7', 'R', { 1: 'SIGAC', 2: 'LINEO' }, '10k')
  b.part('J2', 'LINE', { 1: 'LINEO', 2: 'GND' })
  b.add('U26', 'LM386', { INp: 'AMPIN', BYP: 'BYP', OUT: 'SPKOUT' })
  b.part('C6', 'CP', { 1: 'BYP', 2: 'GND' }, '10u')
  b.part('C7', 'CP', { 1: 'SPKOUT', 2: 'SPKC' }, '220u')
  b.part('R8', 'R', { 1: 'SPKOUT', 2: 'ZOB' }, '10R')
  b.part('C8', 'C', { 1: 'ZOB', 2: 'GND' }, '47n')
  b.part('J3', 'SPK', { 1: 'SPKC', 2: 'GND' })
  for (const net of ['ENV', 'SIG']) b.pad(net)

  return b
}

export const netsOf = (b: Board) => {
  const nets = new Map<string, { ref: string; pin: string }[]>()
  for (const part of b.parts.values())
    for (const [pin, net] of part.conn) {
      const list = nets.get(net) ?? []
      list.push({ ref: part.ref, pin })
      nets.set(net, list)
    }
  return nets
}

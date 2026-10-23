export type Dir = 'i' | 'o' | 'io' | 'p' | 'v'

export interface Pin {
  num: string
  name: string
  dir: Dir
  tie?: 'GND' | 'VCC'
}

export interface PartDef {
  pins: Pin[]
  footprint: string
  value: string
  passive?: boolean
}

const DIP = (n: number) =>
  `Package_DIP:DIP-${n}_W${n === 28 ? '15.24' : '7.62'}mm`

const DIRS: Record<string, Dir> = { i: 'i', o: 'o', io: 'io', p: 'p', v: 'v' }

const pins = (spec: string): Pin[] =>
  spec.split(/\s+/).map(item => {
    const [num = '', name = '', code = ''] = item.split(':')
    const dir = DIRS[code]
    if (!dir) throw new Error(`bad pin spec ${item}`)
    return dir === 'i' ? { num, name, dir, tie: 'GND' } : { num, name, dir }
  })

const ic = (n: number, value: string, spec: string): PartDef => ({
  pins: pins(spec),
  footprint: DIP(n),
  value,
})

const GATE4 = (v: string) =>
  ic(
    14,
    v,
    '1:1A:i 2:1B:i 3:1Y:o 4:2A:i 5:2B:i 6:2Y:o 7:GND:v 8:3Y:o 9:3A:i 10:3B:i 11:4Y:o 12:4A:i 13:4B:i 14:VCC:v',
  )

const INV6 = (v: string) =>
  ic(
    14,
    v,
    '1:1A:i 2:1Y:o 3:2A:i 4:2Y:o 5:3A:i 6:3Y:o 7:GND:v 8:4Y:o 9:4A:i 10:5Y:o 11:5A:i 12:6Y:o 13:6A:i 14:VCC:v',
  )

const passive = (value: string, footprint: string, n = 2): PartDef => ({
  pins: Array.from({ length: n }, (_, i) => ({
    num: String(i + 1),
    name: String(i + 1),
    dir: 'p' as const,
  })),
  footprint,
  value,
  passive: true,
})

const header = (n: number, value = 'header') =>
  passive(
    value,
    `Connector_PinHeader_2.54mm:PinHeader_1x${String(n).padStart(2, '0')}_P2.54mm_Vertical`,
    n,
  )

const named = (def: PartDef, names: string[]): PartDef => ({
  ...def,
  pins: def.pins.map((p, i) => ({ ...p, name: names[i] ?? p.name })),
})

const rnet = (n: number) =>
  named(passive('10k', `Resistor_THT:R_Array_SIP${n}`, n), ['COM'])

const letters = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`)

export const PARTS = {
  '74HC14': INV6('74HC14'),
  '74HC04': INV6('74HC04'),
  '74HC00': GATE4('74HC00'),
  '74HC08': GATE4('74HC08'),
  '74HC32': GATE4('74HC32'),
  '74HC02': ic(
    14,
    '74HC02',
    '1:1Y:o 2:1A:i 3:1B:i 4:2Y:o 5:2A:i 6:2B:i 7:GND:v 8:3A:i 9:3B:i 10:3Y:o 11:4A:i 12:4B:i 13:4Y:o 14:VCC:v',
  ),
  '74HC148': ic(
    16,
    '74HC148',
    '1:I4:i 2:I5:i 3:I6:i 4:I7:i 5:EI:i 6:A2:o 7:A1:o 8:GND:v 9:A0:o 10:I0:i 11:I1:i 12:I2:i 13:I3:i 14:GS:o 15:EO:o 16:VCC:v',
  ),
  '74HC157': ic(
    16,
    '74HC157',
    '1:SEL:i 2:1A:i 3:1B:i 4:1Y:o 5:2A:i 6:2B:i 7:2Y:o 8:GND:v 9:3Y:o 10:3B:i 11:3A:i 12:4Y:o 13:4B:i 14:4A:i 15:OEn:i 16:VCC:v',
  ),
  '74HC573': ic(
    20,
    '74HC573',
    '1:OEn:i 2:D0:i 3:D1:i 4:D2:i 5:D3:i 6:D4:i 7:D5:i 8:D6:i 9:D7:i 10:GND:v 11:LE:i 12:Q7:o 13:Q6:o 14:Q5:o 15:Q4:o 16:Q3:o 17:Q2:o 18:Q1:o 19:Q0:o 20:VCC:v',
  ),
  '74HC161': ic(
    16,
    '74HC161',
    '1:MRn:i 2:CP:i 3:P0:i 4:P1:i 5:P2:i 6:P3:i 7:CEP:i 8:GND:v 9:PEn:i 10:CET:i 11:Q3:o 12:Q2:o 13:Q1:o 14:Q0:o 15:TC:o 16:VCC:v',
  ),
  '74HC393': ic(
    14,
    '74HC393',
    '1:1CP:i 2:1MR:i 3:1Q0:o 4:1Q1:o 5:1Q2:o 6:1Q3:o 7:GND:v 8:2Q3:o 9:2Q2:o 10:2Q1:o 11:2Q0:o 12:2MR:i 13:2CP:i 14:VCC:v',
  ),
  '74HC153': ic(
    16,
    '74HC153',
    '1:1En:i 2:S1:i 3:1I3:i 4:1I2:i 5:1I1:i 6:1I0:i 7:1Y:o 8:GND:v 9:2Y:o 10:2I0:i 11:2I1:i 12:2I2:i 13:2I3:i 14:S0:i 15:2En:i 16:VCC:v',
  ),
  '74HC4040': ic(
    16,
    '74HC4040',
    '1:Q12:o 2:Q6:o 3:Q5:o 4:Q7:o 5:Q4:o 6:Q3:o 7:Q2:o 8:GND:v 9:Q1:o 10:CLK:i 11:RST:i 12:Q9:o 13:Q8:o 14:Q10:o 15:Q11:o 16:VCC:v',
  ),
  '74HC4066': ic(
    14,
    '74HC4066',
    '1:1A:io 2:1B:io 3:2A:io 4:2B:io 5:2C:i 6:3C:i 7:GND:v 8:3A:io 9:3B:io 10:4B:io 11:4A:io 12:4C:i 13:1C:i 14:VCC:v',
  ),
  AT28C64B: ic(
    28,
    'AT28C64B',
    '1:RDY:o 2:A12:i 3:A7:i 4:A6:i 5:A5:i 6:A4:i 7:A3:i 8:A2:i 9:A1:i 10:A0:i 11:D0:o 12:D1:o 13:D2:o 14:GND:v 15:D3:o 16:D4:o 17:D5:o 18:D6:o 19:D7:o 20:CEn:i 21:A10:i 22:OEn:i 23:A11:i 24:A9:i 25:A8:i 26:NC:p 27:WEn:i 28:VCC:v',
  ),
  MCP6002: ic(
    8,
    'MCP6002',
    '1:OUTA:o 2:INAn:i 3:INAp:i 4:VSS:v 5:INBp:i 6:INBn:i 7:OUTB:o 8:VDD:v',
  ),
  LM386: ic(
    8,
    'LM386',
    '1:G1:p 2:INn:i 3:INp:i 4:GND:v 5:OUT:o 6:VS:v 7:BYP:p 8:G8:p',
  ),
  RN3: rnet(3),
  RN5: rnet(5),
  RN6: rnet(6),
  RN9: rnet(9),
  R: passive(
    'R',
    'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal',
  ),
  C: passive('C', 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm'),
  CF: passive('C', 'Capacitor_THT:C_Rect_L7.0mm_W3.5mm_P5.00mm'),
  CP: passive('C', 'Capacitor_THT:CP_Radial_D6.3mm_P2.50mm'),
  CPB: passive('C', 'Capacitor_THT:CP_Radial_D10.0mm_P5.00mm'),
  POT: named(
    passive(
      'pot',
      'Potentiometer_THT:Potentiometer_Alps_RK09K_Single_Vertical',
      3,
    ),
    ['CCW', 'WIPER', 'CW'],
  ),
  D: named(passive('1N5819', 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal'), [
    'A',
    'K',
  ]),
  KEY: passive('key', 'Button_Switch_THT:SW_PUSH_6mm'),
  SLIDE: passive('slide', 'Button_Switch_THT:SW_Slide_1P2T_CK_OS102011MS2Q', 2),
  SPDT: named(
    passive('SPDT', 'Button_Switch_THT:SW_Slide_1P2T_CK_OS102011MS2Q', 3),
    ['A', 'COM', 'B'],
  ),
  DIP5: passive(
    'DIP-5',
    'Button_Switch_THT:SW_DIP_SPSTx05_Slide_9.78x14.88mm_W7.62mm_P2.54mm',
    10,
  ),
  DIP2: passive(
    'DIP-2',
    'Button_Switch_THT:SW_DIP_SPSTx02_Slide_9.78x7.21mm_W7.62mm_P2.54mm',
    4,
  ),
  SP4T: named(
    passive(
      '4-way',
      'Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical',
      5,
    ),
    ['COM', ...letters(4, 'T')],
  ),
  SEL7: named(
    passive(
      '7-way',
      'Connector_PinHeader_2.54mm:PinHeader_1x08_P2.54mm_Vertical',
      8,
    ),
    ['COM', ...letters(7, 'T')],
  ),
  SJ: passive(
    'solder jumper',
    'Jumper:SolderJumper-2_P1.3mm_Bridged_Pad1.0x1.5mm',
  ),
  PAD: passive('pad', 'TestPoint:TestPoint_Pad_D2.0mm', 1),
  HDR2: header(2),
  JACK: named(
    passive('barrel jack', 'Connector_BarrelJack:BarrelJack_Horizontal', 2),
    ['TIP', 'SLEEVE'],
  ),
  SPK: header(2, 'speaker'),
  BT: header(2, '3 x AA'),
  LINE: header(2, 'line out'),
} satisfies Record<string, PartDef>

export type PartType = keyof typeof PARTS

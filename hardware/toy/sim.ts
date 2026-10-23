import { groupsOf } from './erc.ts'

import type { Board, Placed } from './board.ts'

const X = 2

type Eval = () => void
interface Seq {
  clock: number
  edge: 'rise' | 'fall'
  prev: number
  next: () => void
  owner: number
}

export interface SimOptions {
  roms?: Record<string, Uint8Array>
  force?: Record<string, number>
}

export class Sim {
  private readonly val: Uint8Array
  private readonly index = new Map<string, number>()
  private readonly evals: Eval[] = []
  private readonly seqs: Seq[] = []
  private readonly forced = new Map<number, number>()
  private readonly owners: Placed[] = []
  private readonly inputs: number[][] = []
  private readonly deps: number[][]
  private readonly queue: number[] = []
  private readonly queued: Uint8Array
  private readonly roms: Record<string, Uint8Array>

  constructor(board: Board, opts: SimOptions = {}) {
    this.roms = opts.roms ?? {}
    const groups = groupsOf(board)
    const names = [...groups.members.keys()]
    names.forEach((n, i) => this.index.set(n, i))
    for (const [root, nets] of groups.members)
      for (const n of nets) this.index.set(n, this.index.get(root)!)
    this.val = new Uint8Array(names.length).fill(X)
    this.deps = names.map(() => [])
    this.val[this.index.get('VCC')!] = 1
    this.val[this.index.get('GND')!] = 0
    this.weaken(board)
    for (const part of board.parts.values()) this.build(part)
    this.queued = new Uint8Array(this.evals.length)
    this.evals.forEach((_, i) => {
      for (const g of this.inputs[i]!) this.deps[g]!.push(i)
      this.queue.push(i)
      this.queued[i] = 1
    })
    for (const [net, v] of Object.entries(opts.force ?? {})) this.force(net, v)
    this.settle()
    for (const s of this.seqs) s.prev = this.val[s.clock]!
  }

  private weaken(board: Board) {
    for (const part of board.parts.values()) {
      if (part.type !== 'R' && !part.type.startsWith('RN')) continue
      const nets = [...part.conn.values()].map(n => this.index.get(n)!)
      const rail = nets.find(
        g => g === this.index.get('VCC') || g === this.index.get('GND'),
      )
      if (rail === undefined) continue
      const level = this.val[rail]!
      for (const g of nets)
        if (g !== rail && this.val[g] === X) this.val[g] = level
    }
  }

  force(net: string, v: number) {
    const g = this.index.get(net)
    if (g === undefined) throw new Error(`no net ${net}`)
    this.forced.set(g, v)
    if (this.val[g] !== v) {
      this.val[g] = v
      this.wake(g)
    }
  }

  private wake(g: number) {
    for (const i of this.deps[g]!) {
      if (this.queued[i]) continue
      this.queued[i] = 1
      this.queue.push(i)
    }
  }

  get unknownReads() {
    const seen = new Set<string>()
    this.evals.forEach((_, i) => {
      if (this.inputs[i]!.some(g => this.val[g] === X))
        seen.add(this.owners[i]!.ref)
    })
    return seen
  }

  get(net: string): number {
    const g = this.index.get(net)
    if (g === undefined) throw new Error(`no net ${net}`)
    return this.val[g]!
  }

  word(prefix: string, n: number): number {
    let w = 0
    for (let i = 0; i < n; i++) w |= this.get(`${prefix}${i}`) << i
    return w
  }

  private g(part: Placed, pin: string): number {
    const net = part.conn.get(pin)
    if (net === undefined) return -1
    return this.index.get(net)!
  }

  private put(g: number, v: number) {
    if (g < 0 || this.forced.has(g)) return
    if (this.val[g] !== v) {
      this.val[g] = v
      this.wake(g)
    }
  }

  private read(g: number): number {
    const v = this.val[g]!
    return v === X ? 0 : v
  }

  private build(p: Placed) {
    const pin = (name: string) => this.g(p, name)
    const rd = (name: string) => this.read(pin(name))
    const out = (name: string, v: number) => this.put(pin(name), v)
    const owner = this.evals.length
    const add = (e: Eval) => {
      this.evals.push(e)
      this.owners.push(p)
      this.inputs.push(
        p.def.pins
          .filter(x => x.dir === 'i' && p.conn.has(x.name))
          .map(x => pin(x.name)),
      )
    }

    switch (p.type) {
      case '74HC00':
      case '74HC08':
      case '74HC32':
      case '74HC02': {
        const f: Record<string, (a: number, b: number) => number> = {
          '74HC00': (a, b) => 1 - (a & b),
          '74HC08': (a, b) => a & b,
          '74HC32': (a, b) => a | b,
          '74HC02': (a, b) => 1 - (a | b),
        }
        const fn = f[p.type]!
        add(() => {
          for (let i = 1; i <= 4; i++)
            out(`${i}Y`, fn(rd(`${i}A`), rd(`${i}B`)))
        })
        break
      }
      case '74HC04':
        add(() => {
          for (let i = 1; i <= 6; i++)
            if (pin(`${i}A`) >= 0 && pin(`${i}Y`) >= 0)
              out(`${i}Y`, 1 - rd(`${i}A`))
        })
        break
      case '74HC148':
        add(() => {
          const ei = rd('EI')
          let top = -1
          for (let i = 7; i >= 0; i--)
            if (rd(`I${i}`) === 0) {
              top = i
              break
            }
          let code = 7
          let gs = 1
          let eo = 1
          if (ei === 0) {
            if (top >= 0) {
              code = 7 - top
              gs = 0
            } else eo = 0
          }
          out('A0', code & 1)
          out('A1', (code >> 1) & 1)
          out('A2', (code >> 2) & 1)
          out('GS', gs)
          out('EO', eo)
        })
        break
      case '74HC157':
        add(() => {
          const sel = rd('SEL')
          const on = rd('OEn') === 0
          for (let i = 1; i <= 4; i++)
            out(`${i}Y`, on ? rd(sel ? `${i}B` : `${i}A`) : 0)
        })
        break
      case '74HC153':
        add(() => {
          const s = rd('S1') * 2 + rd('S0')
          for (const h of [1, 2]) {
            const en = rd(`${h}En`)
            out(`${h}Y`, en ? 0 : rd(`${h}I${s}`))
          }
        })
        break
      case '74HC573': {
        let state = 0
        add(() => {
          if (rd('LE')) {
            state = 0
            for (let i = 0; i < 8; i++) state |= rd(`D${i}`) << i
          }
          for (let i = 0; i < 8; i++) out(`Q${i}`, (state >> i) & 1)
        })
        break
      }
      case 'AT28C64B': {
        const rom = this.roms[p.ref]
        if (!rom) throw new Error(`no image for ${p.ref}`)
        add(() => {
          let a = 0
          for (let i = 0; i < 13; i++) a |= rd(`A${i}`) << i
          const byte = rom[a] ?? 0xff
          for (let i = 0; i < 8; i++) out(`D${i}`, (byte >> i) & 1)
        })
        break
      }
      case '74HC4040': {
        let n = 0
        const names = [
          'Q1',
          'Q2',
          'Q3',
          'Q4',
          'Q5',
          'Q6',
          'Q7',
          'Q8',
          'Q9',
          'Q10',
          'Q11',
          'Q12',
        ]
        add(() => {
          if (rd('RST')) n = 0
          names.forEach((name, i) => out(name, (n >> i) & 1))
        })
        this.seqs.push({
          clock: pin('CLK'),
          edge: 'fall',
          owner,
          prev: X,
          next: () => {
            if (!rd('RST')) n = (n + 1) & 4095
          },
        })
        break
      }
      case '74HC393': {
        const n = [0, 0]
        add(() => {
          for (const h of [1, 2]) {
            if (rd(`${h}MR`)) n[h - 1] = 0
            for (let i = 0; i < 4; i++) out(`${h}Q${i}`, (n[h - 1]! >> i) & 1)
          }
        })
        for (const h of [1, 2])
          this.seqs.push({
            clock: pin(`${h}CP`),
            edge: 'fall',
            owner,
            prev: X,
            next: () => {
              if (!rd(`${h}MR`)) n[h - 1] = (n[h - 1]! + 1) & 15
            },
          })
        break
      }
      case '74HC161': {
        let n = 0
        add(() => {
          if (!rd('MRn')) n = 0
          for (let i = 0; i < 4; i++) out(`Q${i}`, (n >> i) & 1)
          out('TC', rd('CET') && n === 15 ? 1 : 0)
        })
        this.seqs.push({
          clock: pin('CP'),
          edge: 'rise',
          owner,
          prev: X,
          next: () => {
            if (!rd('MRn')) n = 0
            else if (!rd('PEn')) {
              n = 0
              for (let i = 0; i < 4; i++) n |= rd(`P${i}`) << i
            } else if (rd('CEP') && rd('CET')) n = (n + 1) & 15
          },
        })
        break
      }
      default:
        break
    }
  }

  private comb() {
    let budget = 200000
    while (this.queue.length) {
      const i = this.queue.pop()!
      this.queued[i] = 0
      this.evals[i]!()
      if (--budget < 0) throw new Error('combinational loop')
    }
  }

  settle() {
    for (let guard = 0; guard < 200; guard++) {
      this.comb()
      const fire = this.seqs.filter(s => {
        const v = this.val[s.clock]!
        const hit =
          s.edge === 'rise' ? s.prev === 0 && v === 1 : s.prev === 1 && v === 0
        return hit
      })
      for (const s of this.seqs) s.prev = this.val[s.clock]!
      if (fire.length === 0) return
      for (const s of fire) {
        s.next()
        if (!this.queued[s.owner]) {
          this.queued[s.owner] = 1
          this.queue.push(s.owner)
        }
      }
    }
    throw new Error('ripple loop')
  }

  set(net: string, v: number) {
    this.force(net, v)
    this.settle()
  }

  cycle(clock = 'MCLK') {
    this.set(clock, 1)
    this.set(clock, 0)
  }
}

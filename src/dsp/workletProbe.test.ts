import { expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { IDX, packParams } from '../engine/params.ts'
import { DEST, SRC } from './modbus.ts'
import { BLOCK } from './stage.ts'

import type { FromWorklet, ToWorklet } from '../engine/messages.ts'

class Port {
  onmessage: ((e: { data: ToWorklet }) => void) | null = null
  readonly posted: FromWorklet[] = []
  postMessage(msg: FromWorklet) {
    this.posted.push(msg)
  }
  send(msg: ToWorklet) {
    this.onmessage?.({ data: msg })
  }
}

async function worklet() {
  const ports: Port[] = []
  class Processor {
    readonly port = new Port()
    constructor() {
      ports.push(this.port)
    }
  }
  const registered: (new () => AudioWorkletProcessor)[] = []
  vi.stubGlobal('sampleRate', 48000)
  vi.stubGlobal('AudioWorkletProcessor', Processor)
  vi.stubGlobal(
    'registerProcessor',
    (_name: string, ctor: new () => AudioWorkletProcessor) =>
      registered.push(ctor),
  )
  await import('./worklet.ts')
  const Ctor = registered[0]
  if (!Ctor) throw new Error('the worklet registered no processor')
  const processor = new Ctor()
  const port = ports.at(-1)
  if (!port) throw new Error('the processor took no port')
  return { processor, port }
}

test('a probe answers with the params playing and each wire’s push', async () => {
  const { processor, port } = await worklet()
  const inputs = [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]
  const outputs = [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]
  const pack = packParams({
    ...DEFAULT_CONTROLS,
    chipStarve: 0.4,
    bodyX: 1,
    mod0Src: SRC.bodyX,
    mod0Dest: DEST.filtHz,
    mod0Depth: 0.5,
  })
  port.send({ kind: 'params', pack })
  for (let b = 0; b < 200; b++) processor.process(inputs, outputs, {})
  port.send({ kind: 'probe', id: 7 })
  const probed = port.posted.find(m => m.kind === 'probed')
  expect(probed).toMatchObject({ kind: 'probed', id: 7 })
  if (probed?.kind !== 'probed') return
  expect(probed.heard[IDX.chipStarve]).toBeCloseTo(0.4, 5)
  expect(probed.wires[0]).toBeCloseTo(0.5, 5)
  expect([...probed.wires.subarray(1)].every(Number.isNaN)).toBe(true)
})

// The readout that answers "is anything coming down the wire at all", which is
// the first question a controller that does nothing raises.

import { beforeEach, expect, test, vi } from 'vitest'
import { describe, midi } from './midi'

type Handler = ((e: MIDIMessageEvent) => void) | null

const input = { name: 'MPK mini IV MIDI Port', onmidimessage: null as Handler }
const access = {
  inputs: new Map([['one', input]]),
  outputs: new Map(),
  addEventListener() {},
  removeEventListener() {},
}

vi.stubGlobal('navigator', {
  requestMIDIAccess: () => Promise.resolve(access),
})

const send = (...bytes: number[]) => {
  input.onmidimessage?.({ data: new Uint8Array(bytes) } as MIDIMessageEvent)
}

beforeEach(async () => {
  if (midi.status.get() !== 'ready') {
    midi.enable()
    await vi.waitFor(() => expect(midi.status.get()).toBe('ready'))
  }
})

test('the readout names what came down the wire', () => {
  expect(describe([0x90, 60, 100])).toBe('note on C4 vel 100 ch1')
  expect(describe([0x80, 60, 0])).toBe('note off C4 ch1')
  // A zero-velocity note on is a note off, and the readout has to agree with
  // what the manager does with it or it is worse than no readout.
  expect(describe([0x90, 60, 0])).toBe('note off C4 ch1')
  expect(describe([0xb5, 21, 64])).toBe('CC21 = 64 ch6')
  expect(describe([0xf8])).toBe('clock tick')
})

test('a message counts whether or not the board acts on it', () => {
  midi.setNotes(false)
  const before = midi.traffic.get()?.count ?? 0
  // Notes are off, so this changes nothing on the board — and is still the
  // proof that a controller doing nothing is nonetheless talking.
  send(0x90, 60, 100)
  const after = midi.traffic.get()
  expect(after?.count).toBe(before + 1)
  expect(after?.text).toBe('note on C4 vel 100 ch1')
  expect(after?.port).toBe('MPK mini IV MIDI Port')
})

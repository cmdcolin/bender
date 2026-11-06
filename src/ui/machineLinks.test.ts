import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { MIC } from '../dsp/micJacks.ts'
import { GATE_CUT } from '../dsp/trigbus.ts'
import { SOURCE_TAPS } from '../engine/params.ts'
import { jackFor } from '../jacks.ts'
import { MACHINES } from '../machines.ts'
import { UNITS } from './controls/jacks.ts'
import { boardFromUrl, boardHash } from './share.ts'

// Both forms of a link to this board, written by the commit before the
// machines came off one registry, out of the lists each file kept by hand.
const PACKED =
  'p=AAovFB8eBwIJPAVGAUYCIgBQ2AECUigHBAACBTIAAgEGXVpOAgACAAIAAgACTgIABAACAAQAAuUBIh9kB24QBAAGAAgACgAMAA4AEAASABQAFgAYABoAHAAEAAYACAAEKHgAAgACAggvggEAAgACAAo&v=3'
const LONG =
  'set=chipLevel:0.05,chipMute:1,chipSupply:1,drumSupply:2,fmSupply:1,pcmSupply:2,monoSupply:1,leadSupply:2,drumLevel:0.1,drumMute:1,fmLevel:0.15,fmMute:1,fmStruck:1,fmKeyGate:1,pcmLevel:0.2,pcmMute:1,pcmStruck:2,pcmKeyGate:1,monoLevel:0.25,monoMute:1,monoKeyGate:1,monoStruck:3,leadLevel:0.6,leadMute:1,leadKeyGate:1,leadStruck:4,talkLevel:0.65,talkMute:1,talkSupply:1,talkStruck:5,oscLevel:0.3,noiseLevel:0.35,crackleAmp:0.35,sheetLevel:0.5,bottleLevel:0.55,micPatch:17,micPatch2:17,sampleLevel:0.4,fourLevel:0.45,ringInto:2,crushInto:3,distInto:4,combInto:5,glitchInto:6,filtInto:7,shiftInto:8,octInto:9,codecInto:10,rackInto:11,stompInto:12,dlyInto:13,echoInto:14,revInto:2,ensInto:3,ampInto:4'

// Every machine's faders, mute, supply, jumper and trigger line moved, every
// unit cabled onto a machine, and both mic wires on machines' jacks.
function everyMachine() {
  const c: Controls = { ...DEFAULT_CONTROLS }
  MACHINES.forEach((m, i) => {
    for (const k of m.levels) c[k] = (i + 1) / 20
    if ('mute' in m) c[m.mute] = 1
    if ('keyGate' in m) c[m.keyGate] = GATE_CUT
  })
  MACHINES.flatMap(m => ('supply' in m ? [m.supply] : [])).forEach((k, i) => {
    c[k] = 1 + (i % 2)
  })
  MACHINES.flatMap(m => ('struck' in m ? [m.struck] : [])).forEach((k, i) => {
    c[k] = i + 1
  })
  UNITS.forEach((u, i) => {
    c[u.into] = jackFor(SOURCE_TAPS[i % SOURCE_TAPS.length]!)
  })
  c.micPatch = MIC.prattleIn
  c.micPatch2 = MIC.howlerIn + 1
  return c
}

test('a board touching every machine links as it did before the registry', () => {
  const c = everyMachine()
  expect(boardHash('', c)).toBe(PACKED)
  expect(boardHash('#set=', c)).toBe(LONG)
})

test('both links read back as that board', () => {
  const c = everyMachine()
  for (const hash of [PACKED, LONG])
    expect({ ...DEFAULT_CONTROLS, ...boardFromUrl('', `#${hash}`) }).toEqual(c)
})

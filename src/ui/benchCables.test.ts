import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { DEST } from '../dsp/modbus.ts'
import { ANY_CHOICE } from '../dsp/trigbus.ts'
import {
  cablesOn,
  dropped,
  endOf,
  jackKey,
  KINDS,
  lastInto,
  parseCables,
  pressed,
  voiceIn,
  writeCables,
  type End,
} from './benchCables.ts'
import { ADSR, CV_DEST, LFO } from './modCables.ts'

const board = {
  ...DEFAULT_CONTROLS,
  fmKeyGate: 0,
  pcmKeyGate: 1,
  monoKeyGate: 1,
  trigToDrum: 0,
  trigToKeys: 0,
  fmStruck: 0,
  pcmStruck: 0,
  monoStruck: 0,
  modEnvGate: 0,
  mod0Src: 0,
  mod1Src: 0,
  mod2Src: 0,
  mod3Src: 0,
}

const end = (key: string) => endOf(key)!

test('a jack key reads back as the end it names', () => {
  const e: End = { line: 'mod', side: 'in', id: 'Glint' }
  expect(endOf(jackKey(e))).toEqual(e)
  expect(endOf('wire:in:Glint')).toBeNull()
  expect(endOf(undefined)).toBeNull()
})

test('pressing an input pulls its cable, then plugs the line’s usual output', () => {
  const pulled = pressed(board, end('gate:in:fm'))
  expect(pulled.fmKeyGate).toBe(1)
  expect(pressed(pulled, end('gate:in:fm')).fmKeyGate).toBe(0)
  expect(pressed(board, end('trig:in:mono')).monoStruck).toBe(ANY_CHOICE)
  const cv = pressed(board, end('mod:in:Growler'))
  expect(cv.mod0Src).toBe(LFO)
  expect(cv.mod0Dest).toBe(CV_DEST.Growler)
})

test('a fresh cable plugs whichever way it is dragged', () => {
  expect(
    dropped(board, end('trig:out:2'), null, end('trig:in:pcm')).pcmStruck,
  ).toBe(2)
  expect(
    dropped(board, end('trig:in:pcm'), null, end('trig:out:2')).pcmStruck,
  ).toBe(2)
  expect(
    dropped(board, end('gate:out:plinky'), null, end('gate:in:kit')).trigToDrum,
  ).toBe(ANY_CHOICE)
})

test('a fresh cable dropped on its own side or another line changes nothing', () => {
  expect(dropped(board, end('trig:out:2'), null, end('trig:out:3'))).toBe(board)
  expect(dropped(board, end('trig:out:2'), null, end('gate:in:fm'))).toBe(board)
  expect(dropped(board, end('trig:out:2'), null, null)).toBe(board)
})

test('a carried cable moves to the input it lands on, or pulls anywhere else', () => {
  const glint = lastInto(board, end('gate:in:fm'))!
  const moved = dropped(
    board,
    end('gate:out:plinky'),
    glint,
    end('gate:in:pcm'),
  )
  expect([moved.fmKeyGate, moved.pcmKeyGate]).toEqual([1, 0])
  expect(dropped(board, end('gate:out:plinky'), glint, null).fmKeyGate).toBe(1)
  expect(dropped(board, end('gate:out:plinky'), glint, end('gate:in:fm'))).toBe(
    board,
  )
})

test('the ADSR’s gate reads keys as empty and maps voices both ways', () => {
  const kick = KINDS.trig.plug(board, 'adsr', '1')
  expect(kick.modEnvGate).toBe(2)
  expect(voiceIn('adsr', kick)).toBe(1)
  expect(KINDS.trig.plug(board, 'adsr', String(ANY_CHOICE)).modEnvGate).toBe(1)
  expect(voiceIn('adsr', board)).toBe(0)
})

test('the ADSR’s gate starts empty, and a cable into it draws', () => {
  const drawn = (c: typeof board) =>
    cablesOn(c).some(x => x.line === 'trig' && x.in === 'adsr')
  expect(drawn({ ...board, modEnvGate: 3 })).toBe(true)
  expect(drawn(DEFAULT_CONTROLS)).toBe(false)
})

test('MOD runs out of cables once all four wires are in use', () => {
  const busy = { ...board, mod0Src: LFO, mod1Src: LFO, mod2Src: LFO }
  expect(KINDS.mod.full?.(busy)).toBe(false)
  expect(
    KINDS.mod.full?.({ ...busy, mod3Src: ADSR, mod3Dest: DEST.fmLevel }),
  ).toBe(true)
})

test('an AUDIO cable runs from Plinky while a synth takes its pin', () => {
  expect(cablesOn(board).filter(x => x.line === 'audio')).toEqual([])
  expect(
    cablesOn({ ...board, monoToyIn: 0.4 }).filter(x => x.line === 'audio'),
  ).toEqual([{ line: 'audio', id: 'mono', out: 'plinky', in: 'mono' }])
})

test('pressing a synth’s AUDIO jack plugs Plinky in, then pulls it', () => {
  const plugged = pressed(board, end('audio:in:lead'))
  expect(plugged.leadToyIn).toBe(1)
  expect(pressed(plugged, end('audio:in:lead')).leadToyIn).toBe(0)
})

test('an AUDIO cable dragged to the other synth keeps its level', () => {
  const fed = { ...board, monoToyIn: 0.4 }
  const cable = lastInto(fed, end('audio:in:mono'))!
  const moved = dropped(
    fed,
    end('audio:out:plinky'),
    cable,
    end('audio:in:lead'),
  )
  expect(moved.monoToyIn).toBe(0)
  expect(moved.leadToyIn).toBe(0.4)
})

test('the cable list survives its string form', () => {
  const c = { ...board, fmStruck: 1, mod1Src: LFO, mod1Dest: CV_DEST.Glint }
  expect(parseCables(writeCables(cablesOn(c)))).toEqual(cablesOn(c))
})

test('an AUDIO cable carries its flip-flop to the other synth', () => {
  const fed = { ...board, monoToyIn: 1, monoToyDiv: 2 }
  const cable = lastInto(fed, end('audio:in:mono'))!
  expect(KINDS.audio.says(fed, cable)).toContain('÷4')
  const moved = dropped(
    fed,
    end('audio:out:plinky'),
    cable,
    end('audio:in:lead'),
  )
  expect(moved.leadToyDiv).toBe(2)
})

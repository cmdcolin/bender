import { DEFAULT_CONTROLS, type ControlKey, type Controls } from '../controls'
import { SLIDER_BY_KEY, snapToStep } from './controls'
import { asLen, asMask, LEN_KEYS } from '../drums'
import { asTuneLen, asTuneStep, TUNE_STEP_KEYS } from '../tune'

// The short form of a board: the same controls the long form names, written as
// bytes instead of words. A dice roll is 433 characters by name and 92 packed,
// and a board with a melody and a kit on it is 575 against 152 — four times
// shorter, which is the difference between a link that survives a chat window
// and one that arrives in three pieces.
//
// Compression proper does not get you there. Deflate and brotli both come out
// *longer* than the names on two thirds of the presets: base64 charges a third
// of the payload back in overhead and there is not enough text in a
// ninety-character string for a dictionary coder to earn it back. What pays is
// dropping the words — a control is a number in a list, and its value is which
// step of its own travel it sits on.
//
// Nothing is lost doing that. The long form already snaps every value it reads
// to the control's step, so the step index is the whole of what a link ever
// carried. See share.ts for which form goes in the bar.

// The wire order, and the reason this list is written out rather than taken
// from CONTROL_KEYS: a packed link says "control 84", so the day someone tidies
// DEFAULT_CONTROLS into alphabetical order every link ever made would quietly
// decode to a different board. Adding a control means appending here — never
// inserting, never reordering. packed.test.ts fails if the two lists stop
// holding the same names, which is what turns "append" from a rule people
// remember into one the build checks.
export const URL_KEY_ORDER: readonly ControlKey[] = [
  'chipLevel',
  'chipTune',
  'chipTone',
  'chipAccomp',
  'chipClockX',
  'chipStarve',
  'chipBattery',
  'chipCap',
  'chipClipHz',
  'chipClipClock',
  'chipDataLine',
  'chipDataFault',
  'chipAddrLine',
  'chipAddrFault',
  'chipBusCut',
  'chipBendSpot',
  'chipBendPot',
  'chipDrift',
  'chipLatch',
  'chipLeadR',
  'chipDecouple',
  'chipWatchdog',
  'chipLatchHold',
  'chipClipBite',
  'chipClipHold',
  'chipClipCharge',
  'chipClipRelease',
  'chipDragOct',
  'chipSpread',
  'chipMixDrive',
  'tuneStep0',
  'tuneStep1',
  'tuneStep2',
  'tuneStep3',
  'tuneStep4',
  'tuneStep5',
  'tuneStep6',
  'tuneStep7',
  'tuneStep8',
  'tuneStep9',
  'tuneStep10',
  'tuneStep11',
  'tuneStep12',
  'tuneStep13',
  'tuneStep14',
  'tuneStep15',
  'tuneLen',
  'tuneRate',
  'drumLevel',
  'drumBpm',
  'drumSwing',
  'drumTune',
  'drumDecay',
  'drumBits',
  'drumLadder',
  'drumLadderTol',
  'drumOverflow',
  'drumRetrigHz',
  'drumTrigFloor',
  'drumCross',
  'drumCrossAmt',
  'drumAddrLine',
  'drumAddrFault',
  'drumDataLine',
  'drumDataFault',
  'drumBusCut',
  'drumKick',
  'drumSnare',
  'drumHat',
  'drumClap',
  'drumTom',
  'drumBell',
  'drumAccent',
  'drumKickLen',
  'drumSnareLen',
  'drumHatLen',
  'drumClapLen',
  'drumTomLen',
  'drumBellLen',
  'drumAccentLen',
  'fmLevel',
  'fmVoice',
  'fmBright',
  'fmFeedback',
  'fmModRatio',
  'fmCarRatio',
  'fmModDecay',
  'fmLength',
  'fmStruck',
  'fmEffect',
  'fmDataLine',
  'fmDataFault',
  'fmAddrLine',
  'fmAddrFault',
  'fmBusCut',
  'fmStrobe',
  'fmWaveLine',
  'fmWaveFault',
  'oscLevel',
  'oscAHz',
  'oscBHz',
  'oscXmod',
  'oscShape',
  'oscStarve',
  'noiseLevel',
  'noiseColor',
  'crackleAmp',
  'crackleRate',
  'micLevel',
  'micPatch',
  'sampleLevel',
  'sampleSpeed',
  'sampleTrig',
  'sampleMode',
  'loopRec',
  'loopErase',
  'loopSecs',
  'loopIn',
  'loopOut',
  'mixDrive',
  'bendSlot0',
  'bendSlot1',
  'bendSlot2',
  'bendSlot3',
  'bendSlot4',
  'bendSlot5',
  'ringHz',
  'ringShape',
  'ringMix',
  'bits',
  'srHz',
  'srJitter',
  'crushMix',
  'driveDb',
  'distBias',
  'distMode',
  'distToneHz',
  'subLevel',
  'distMix',
  'filtHz',
  'filtRes',
  'filtMode',
  'filtDriveDb',
  'filtMix',
  'combHz',
  'combFb',
  'combDampHz',
  'combMix',
  'glitchProb',
  'glitchSliceMs',
  'glitchRepeat',
  'glitchRevProb',
  'glitchPitch',
  'glitchFreeze',
  'glitchMix',
  'shiftHz',
  'shiftDir',
  'shiftFb',
  'shiftMix',
  'stompCircuit',
  'stompDrive',
  'stompTone',
  'stompBias',
  'stompSag',
  'stompLevel',
  'stompMix',
  'delayMs',
  'dlyFb',
  'wowDepthMs',
  'wowHz',
  'flutter',
  'dlyToneHz',
  'tapeBrake',
  'tapeMotorRail',
  'dlyMix',
  'echoMode',
  'echoMs',
  'echoFb',
  'echoToneHz',
  'echoMod',
  'echoLevel',
  'revDecayS',
  'revToneHz',
  'revBoing',
  'revMix',
  'revDryCut',
  'modLfoHz',
  'modLfoShape',
  'mod0Src',
  'mod0Dest',
  'mod0Depth',
  'mod1Src',
  'mod1Dest',
  'mod1Depth',
  'mod2Src',
  'mod2Dest',
  'mod2Depth',
  'mod3Src',
  'mod3Dest',
  'mod3Depth',
  'bodyX',
  'bodyY',
  'trigToKeys',
  'trigKeysNote',
  'trigToDrum',
  'fbAmt',
  'fbDelayMs',
  'fbTone',
  'fbDest',
  'fb2Amt',
  'fb2Ms',
  'fb2Tone',
  'fb3Amt',
  'fb3Ms',
  'fb3Tone',
  'fbCross',
  'fbRails',
  'fbAsym',
  'fbSlew',
  'fbBlock',
  'fbSag',
  'brownAmt',
  'brownRate',
  'brownCrackle',
  'humLevel',
  'humHz',
  'tapeMix',
  'tapeSpeed',
  'tapeDrive',
  'tapeBias',
  'tapeHiss',
  'tapeWow',
  'tapeFlutter',
  'tapeDrop',
  'tapePrint',
  'tapeAzimuth',
  'tapeHyst',
  'tapeBump',
  'tapeSqueal',
  'heatAmt',
  'faultCluster',
  'jointChatter',
  'relayRate',
  'couple',
  'outGain',
  'tuneStep16',
  'tuneStep17',
  'tuneStep18',
  'tuneStep19',
  'tuneStep20',
  'tuneStep21',
  'tuneStep22',
  'tuneStep23',
  'tuneStep24',
  'tuneStep25',
  'tuneStep26',
  'tuneStep27',
  'tuneStep28',
  'tuneStep29',
  'tuneStep30',
  'tuneStep31',
]

const INDEX = new Map(URL_KEY_ORDER.map((k, i) => [k, i]))
const TUNE = new Set<ControlKey>(TUNE_STEP_KEYS)

// A step of the memory is a note, a rest (-128) or a hold (-127), and the wire
// carries unsigned numbers, so the whole row shifts up by its own floor.
const TUNE_FLOOR = 128

// Every control as a whole number of its own steps. A slider is how far along
// its travel it sits; the widgets that are not sliders already hold integers —
// sixteen bits of pattern, a step count, a note.
function toInt(key: ControlKey, v: number): number {
  const def = SLIDER_BY_KEY.get(key)
  if (def) return Math.max(0, Math.round((v - def.min) / def.step))
  if (TUNE.has(key)) return v + TUNE_FLOOR
  return v
}

function fromInt(key: ControlKey, n: number): number {
  const def = SLIDER_BY_KEY.get(key)
  // Through the same snap the long form goes through, so a slider whose range
  // has moved since the link was made lands where a named link would land.
  if (def) return snapToStep(def, def.min + n * def.step)
  if (TUNE.has(key)) return asTuneStep(n - TUNE_FLOOR)
  if (LEN_KEYS.has(key)) return asLen(n)
  if (key === 'tuneLen') return asTuneLen(n)
  return asMask(n)
}

function putVarint(out: number[], n: number) {
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80)
    n >>>= 7
  }
  out.push(n)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// Written out rather than handed to btoa, which wants a binary string and then
// wants three characters swapped back out of its answer to be url-safe. The
// alphabet above is already the one a fragment carries as itself.
//
// Nothing pads: dropping the '=' costs the decoder nothing, because n bytes
// always come back out of ceil(n * 4 / 3) characters exactly.
function toBase64Url(bytes: readonly number[]): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n =
      ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const left = bytes.length - i
    out += (B64[(n >> 18) & 63] ?? '') + (B64[(n >> 12) & 63] ?? '')
    if (left > 1) out += B64[(n >> 6) & 63] ?? ''
    if (left > 2) out += B64[n & 63] ?? ''
  }
  return out
}

function fromBase64Url(text: string): number[] | null {
  const bytes: number[] = []
  let acc = 0
  let bits = 0
  // '=' because a link may have been through something that pads, and the
  // other two because the plain alphabet is what most encoders reach for.
  for (const ch of text.replace(/=+$/, '')) {
    const v = B64.indexOf(ch === '+' ? '-' : ch === '/' ? '_' : ch)
    if (v < 0) return null
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((acc >> bits) & 0xff)
    }
  }
  return bytes
}

/** A board as bytes: every control off stock, by position in URL_KEY_ORDER. */
export function packControls(
  c: Controls,
  skip: (key: ControlKey) => boolean,
): string {
  const bytes: number[] = []
  let prev = -1
  for (const key of URL_KEY_ORDER) {
    if (skip(key)) continue
    const v = c[key]
    if (v === DEFAULT_CONTROLS[key] || !Number.isFinite(v)) continue
    const i = INDEX.get(key) ?? 0
    // The gap since the last control written rather than the index itself:
    // what a board holds arrives in runs — sixteen steps of a melody are
    // sixteen ones — and a run costs one byte a control instead of two.
    putVarint(bytes, i - prev - 1)
    prev = i
    putVarint(bytes, toInt(key, v))
  }
  return toBase64Url(bytes)
}

export function unpackControls(
  text: string,
  skip: (key: ControlKey) => boolean,
): Partial<Controls> {
  const bytes = fromBase64Url(text)
  if (bytes === null) return {}
  const out: Partial<Controls> = {}
  let at = 0
  let prev = -1
  const varint = (): number | null => {
    let n = 0
    let shift = 0
    for (;;) {
      const byte = bytes[at++]
      if (byte === undefined || shift > 28) return null
      n |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) return n >>> 0
      shift += 7
    }
  }
  while (at < bytes.length) {
    const gap = varint()
    const value = gap === null ? null : varint()
    // A truncated link gives up the rest of the board and keeps what it read,
    // because a url that lost its tail in a chat window is still most of a
    // board.
    if (gap === null || value === null) break
    const i = prev + 1 + gap
    prev = i
    const key = URL_KEY_ORDER[i]
    // A control this build has never heard of is read past rather than ending
    // the board: every field is a varint, so the reader can always find the
    // next one. A link made by a newer app opens here as itself minus whatever
    // it names that does not exist yet.
    if (key === undefined || skip(key)) continue
    out[key] = fromInt(key, value)
  }
  return out
}

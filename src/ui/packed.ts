import { DEFAULT_CONTROLS, type ControlKey, type Controls } from '../controls'
import { SLIDER_BY_KEY, snapToStep } from './controls'
import { asLen, asMask, LEN_KEYS } from '../drums'
import { asTuneLen, asTuneStep, TUNE_ALL_STEP_KEYS } from '../tune'

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
// to the control's step, so the step count is the whole of what a link ever
// carried. See share.ts for which form goes in the bar.
//
// A named link carries its own meaning — `#set=noiseColor:0.4` is 0.4 in a year
// no matter what the app does to that control in the meantime. A packed one
// carries two numbers and takes the rest from this file, so everything this
// file could change out from under an old link is a way to move boards that are
// already in the world, silently, with nothing in the link for a reader to
// check against. There are three such things, and each is nailed down here:
// the position of a control in the wire order, the zero the value is counted
// from, and the step it is counted in. packed.test.ts holds all three.

// The wire order, and the reason this list is written out rather than taken
// from CONTROL_KEYS: a packed link says "control 84", so the day someone tidies
// DEFAULT_CONTROLS into alphabetical order every link ever made would quietly
// decode to a different board. Adding a control means appending here — never
// inserting, never reordering, and never deleting either. A control the app
// drops keeps its slot, rewritten as `gone:<name>`, because everything below it
// is at a fixed distance from the front and closing the gap would renumber the
// lot. packed.test.ts pins the order that exists, so an append is the only edit
// that passes.
type Retired = `gone:${string}`

export const URL_KEY_ORDER: readonly (ControlKey | Retired)[] = [
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

  // Appended, as everything here is: the stacked memory chips and the switch
  // that says whether the chip is reading them.
  'tuneStackA0',
  'tuneStackA1',
  'tuneStackA2',
  'tuneStackA3',
  'tuneStackA4',
  'tuneStackA5',
  'tuneStackA6',
  'tuneStackA7',
  'tuneStackA8',
  'tuneStackA9',
  'tuneStackA10',
  'tuneStackA11',
  'tuneStackA12',
  'tuneStackA13',
  'tuneStackA14',
  'tuneStackA15',
  'tuneStackA16',
  'tuneStackA17',
  'tuneStackA18',
  'tuneStackA19',
  'tuneStackA20',
  'tuneStackA21',
  'tuneStackA22',
  'tuneStackA23',
  'tuneStackA24',
  'tuneStackA25',
  'tuneStackA26',
  'tuneStackA27',
  'tuneStackA28',
  'tuneStackA29',
  'tuneStackA30',
  'tuneStackA31',
  'tuneStackB0',
  'tuneStackB1',
  'tuneStackB2',
  'tuneStackB3',
  'tuneStackB4',
  'tuneStackB5',
  'tuneStackB6',
  'tuneStackB7',
  'tuneStackB8',
  'tuneStackB9',
  'tuneStackB10',
  'tuneStackB11',
  'tuneStackB12',
  'tuneStackB13',
  'tuneStackB14',
  'tuneStackB15',
  'tuneStackB16',
  'tuneStackB17',
  'tuneStackB18',
  'tuneStackB19',
  'tuneStackB20',
  'tuneStackB21',
  'tuneStackB22',
  'tuneStackB23',
  'tuneStackB24',
  'tuneStackB25',
  'tuneStackB26',
  'tuneStackB27',
  'tuneStackB28',
  'tuneStackB29',
  'tuneStackB30',
  'tuneStackB31',
  'tunePoly',
  'pedalOrder',
  'fmKeyGate',
  'chipArp',
  'chipArpHz',
  'chipArpOct',
  'keyScale',
  'keyRoot',
  'drumKickMaybe',
  'drumSnareMaybe',
  'drumHatMaybe',
  'drumClapMaybe',
  'drumTomMaybe',
  'drumBellMaybe',
  'drumChance',
]

const INDEX = new Map(URL_KEY_ORDER.map((k, i) => [k, i]))
const TUNE = new Set<ControlKey>(TUNE_ALL_STEP_KEYS)

const isLive = (key: ControlKey | Retired | undefined): key is ControlKey =>
  key !== undefined && !key.startsWith('gone:')

// Every control as a whole number of its own steps, counted from zero — and the
// zero is the point. Counting from the control's own min is a step cheaper and
// is what this used to do, but ranges get widened: drumTune's floor has already
// moved once, from 0.25 to 0.125, and had a link been counting from it that day
// every drumTune ever shared would have slid twelve steps down. From zero, a
// widened range is what it ought to be — the same values, with more of them now
// reachable — and it costs about a tenth of the payload to say so.
//
// Exact only while a control's min is itself a whole number of steps, or its
// travel sits on one grid and the wire counts in another and the round trip
// loses up to half a step. packed.test.ts holds every slider to that.
//
// step is deliberately not pinned. Change one and an old link moves by less
// than a step: bounded, small enough to stay the board it was, and nothing like
// a floor moving out from under it.
//
// The widgets that are not sliders already hold integers — sixteen bits of
// pattern, a step count, a note, where a rest is -128 and a hold -127.
function toInt(key: ControlKey, v: number): number {
  const def = SLIDER_BY_KEY.get(key)
  return def ? Math.round(v / def.step) : v
}

function fromInt(key: ControlKey, n: number): number {
  const def = SLIDER_BY_KEY.get(key)
  // Through the same snap the long form goes through, so a value the travel has
  // since grown past lands at the end of it rather than outside.
  if (def) return snapToStep(def, n * def.step)
  if (TUNE.has(key)) return asTuneStep(n)
  if (LEN_KEYS.has(key)) return asLen(n)
  if (key === 'tuneLen') return asTuneLen(n)
  return asMask(n)
}

// Counting from zero means half the numbers are negative — a depth, a bias, a
// rest — and a varint carries unsigned ones, so the sign rides in the low bit.
// The alternative is a per-control offset, which is the thing being removed.
const zigzag = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n)
const unzigzag = (n: number) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2)

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
    if (!isLive(key) || skip(key)) continue
    const v = c[key]
    if (v === DEFAULT_CONTROLS[key] || !Number.isFinite(v)) continue
    const i = INDEX.get(key) ?? 0
    // The gap since the last control written rather than the index itself:
    // what a board holds arrives in runs — sixteen steps of a melody are
    // sixteen ones — and a run costs one byte a control instead of two.
    putVarint(bytes, i - prev - 1)
    prev = i
    putVarint(bytes, zigzag(toInt(key, v)))
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
    // A control this build does not have is read past rather than ending the
    // board: every field is a varint, so the reader can always find the next
    // one. That covers both directions of drift — a link made by a newer app
    // naming something not built yet, and an old link still naming a control
    // that has since been retired out of the app.
    if (!isLive(key) || skip(key)) continue
    out[key] = fromInt(key, unzigzag(value))
  }
  return out
}

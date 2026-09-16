import { useEffect, useRef } from 'react'

import { MOOD, MOOD_NAMES } from '../dsp/stages/pet'
import { PHRASE_NAMES } from '../dsp/stages/petRom'
import { engine } from '../engine/engine'
import { useMeterValue } from './ControlsContext'
import styles from './TalkingPet.module.css'
import { Tip } from './Tip'

// Eyelid closure per mood in MOOD order, from 0 open to 1 shut.
const MOOD_LID = [1, 0.05, 0, 0.25, 0, 0.55]
// Cam turns per second at full motor speed.
const CAM_HZ = 3
const EAR_SWING = 16
// How far the lower beak drops per unit of speech level, and the most it drops.
const BEAK_DROP = 16
const BEAK_MAX = 9
const EYE_R = 13

// Builds a fur outline around an ellipse by pushing every other point outward,
// with a fixed wobble so the tufts vary in length.
function furPath(cx: number, cy: number, rx: number, ry: number, n: number) {
  const points = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const tuft = i % 2 === 0 ? 1.08 + 0.04 * Math.sin(i * 2.3) : 0.97
    return `${(cx + Math.cos(a) * rx * tuft).toFixed(1)} ${(cy + Math.sin(a) * ry * tuft).toFixed(1)}`
  })
  return `M ${points.join(' L ')} Z`
}

const BODY = furPath(70, 70, 44, 42, 56)
const BELLY = furPath(70, 96, 25, 17, 28)
const EYES = [54, 86]

// The effect rounds each value before writing it, so a change too small to see
// leaves the SVG untouched.
const half = (v: number) => Math.round(v * 2) / 2

const setAttr = (el: Element | null, name: string, value: string) => {
  if (el && el.getAttribute(name) !== value) el.setAttribute(name, value)
}

// TalkingPet draws the pet toy. The cam motor swings the ears and closes the
// eyelids, and the speech level opens the beak. Mood and phrase change a few
// times a minute, so React renders them. The motor and speech readings change
// on every meter post, so an effect writes them to the SVG attributes directly.
export function TalkingPet() {
  const mood = useMeterValue(m => m.petMood)
  const phrase = useMeterValue(m => m.petPhrase)
  const moodRef = useRef(mood)
  const svg = useRef<SVGSVGElement>(null)

  useEffect(() => {
    moodRef.current = mood
  }, [mood])

  useEffect(() => {
    const root = svg.current
    if (!root) return undefined
    const ears = root.querySelectorAll('[data-ear]')
    const lids = root.querySelectorAll('[data-lid]')
    const beak = root.querySelector('[data-beak]')
    let cam = 0
    let last = performance.now()
    return engine.meter.subscribe(() => {
      const m = engine.meter.get()
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      cam = (cam + m.petMotor * dt * CAM_HZ) % 1
      const swing =
        Math.sin(cam * Math.PI * 2) * EAR_SWING * Math.min(m.petMotor * 2, 1)
      ears.forEach((ear, i) =>
        setAttr(
          ear,
          'transform',
          `translate(${i === 0 ? 44 : 96} 38) scale(${i === 0 ? 1 : -1} 1) rotate(${Math.round(swing)})`,
        ),
      )
      const base = MOOD_LID[moodRef.current] ?? 0
      const blink = m.petPhrase < 0 ? Math.min(m.petMotor * 1.5, 1) : 0
      const lid = base + (1 - base) * blink
      lids.forEach(el =>
        setAttr(el, 'height', String(half(lid * EYE_R * 2 + 1))),
      )
      setAttr(
        beak,
        'transform',
        `translate(0 ${half(Math.min(m.petMouth * BEAK_DROP, BEAK_MAX))})`,
      )
    })
  }, [])

  const name = MOOD_NAMES[mood] ?? 'awake'
  const saying = phrase >= 0 ? PHRASE_NAMES[phrase] : undefined
  const scared = mood === MOOD.scared
  const lid = MOOD_LID[mood] ?? 0

  return (
    <Tip text="The talking pet wakes on sound, gets scared by a loud sound or a run of drum hits, gets chatty on drum hits and falls asleep after a long quiet. Its motor draws current from the same batteries as the keyboard.">
      <div
        className={scared ? styles.petScared : styles.pet}
        role="img"
        aria-label={`talking pet, ${name}${saying ? `, saying ${saying}` : ''}`}
      >
        <div className={styles.perch}>
          {saying ? (
            <span className={styles.bubble}>{saying}</span>
          ) : (
            mood === MOOD.asleep && <span className={styles.snore}>z z z</span>
          )}
          <svg
            ref={svg}
            className={styles.figure}
            viewBox="0 0 140 124"
            aria-hidden="true"
          >
            <ellipse
              className={styles.shadow}
              cx="70"
              cy="118"
              rx="40"
              ry="5"
            />
            {[0, 1].map(i => (
              <g
                key={i}
                data-ear
                transform={`translate(${i === 0 ? 44 : 96} 38) scale(${i === 0 ? 1 : -1} 1)`}
              >
                <path
                  className={styles.fur}
                  d="M -10 6 C -14 -14 -22 -32 -30 -44 C -12 -36 4 -22 10 0 Z"
                />
                <path
                  className={styles.earInner}
                  d="M -5 2 C -9 -12 -15 -24 -21 -33 C -9 -27 1 -16 4 -2 Z"
                />
              </g>
            ))}
            <path className={styles.fur} d={BODY} />
            <path className={styles.belly} d={BELLY} />
            {EYES.map(cx => (
              <g key={cx}>
                <clipPath id={`pet-eye-${cx}`}>
                  <circle cx={cx} cy="60" r={EYE_R} />
                </clipPath>
                <circle className={styles.eye} cx={cx} cy="60" r={EYE_R} />
                <circle
                  className={styles.pupil}
                  cx={cx}
                  cy="61"
                  r={scared ? 3.5 : 6}
                />
                <circle
                  className={styles.glint}
                  cx={cx + 2}
                  cy="58"
                  r={scared ? 1.2 : 2}
                />
                <rect
                  className={styles.lid}
                  clipPath={`url(#pet-eye-${cx})`}
                  data-lid
                  x={cx - EYE_R - 1}
                  y={60 - EYE_R - 1}
                  width={EYE_R * 2 + 2}
                  height={lid * EYE_R * 2 + 1}
                />
                <circle className={styles.rim} cx={cx} cy="60" r={EYE_R} />
              </g>
            ))}
            <ellipse className={styles.mouth} cx="70" cy="87" rx="6" ry="8" />
            <path
              data-beak
              className={styles.beakLow}
              d="M 63 80 Q 70 79 77 80 Q 74 88 70 89 Q 66 88 63 80 Z"
            />
            <path
              className={styles.beak}
              d="M 60 77 Q 70 70 80 77 Q 76 83 70 84 Q 64 83 60 77 Z"
            />
            <ellipse className={styles.foot} cx="54" cy="112" rx="11" ry="5" />
            <ellipse className={styles.foot} cx="86" cy="112" rx="11" ry="5" />
          </svg>
        </div>
        <span className={styles.caption}>
          talking pet · <span className={styles.mood}>{name}</span>
        </span>
      </div>
    </Tip>
  )
}

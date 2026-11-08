import { expect, test } from 'vitest'

import { readProgress } from '../../scripts/ytdlp.ts'
import { linkCredit, progressText } from './ytdlp.ts'

test('readProgress reads the marked lines and passes the title by', () => {
  expect(readProgress('bender 3072 309288')).toEqual({
    loaded: 3072,
    total: 309288,
  })
  expect(readProgress('bender 1024 NA')).toEqual({ loaded: 1024, total: 0 })
  expect(readProgress('Me at the zoo')).toBeUndefined()
})

test('progressText says how far a fetch has got', () => {
  expect(progressText(1_200_000, 4_500_000)).toBe(
    'fetching with yt-dlp… 1.2 of 4.5 MB',
  )
  expect(progressText(800_000, 0)).toBe('fetching with yt-dlp… 0.8 MB')
})

test('linkCredit drops the scheme and www', () => {
  expect(linkCredit('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toBe(
    'youtube.com/watch?v=jNQXAC9IVRw',
  )
  expect(linkCredit('https://example.com/')).toBe('example.com')
})

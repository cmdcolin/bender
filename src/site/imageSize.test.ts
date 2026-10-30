import { afterEach, expect, test, vi } from 'vitest'

import { imageSize } from './imageSize.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('an image url that is not there names the url and the status', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response('<html>gone</html>', {
          status: 404,
          statusText: 'Not Found',
        }),
      ),
    ),
  )
  await expect(imageSize('https://example.com/a.webp')).rejects.toThrow(
    'fetching https://example.com/a.webp for its size: 404 Not Found',
  )
})

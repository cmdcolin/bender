// The pile a shared link unfurls with, drawn by `pnpm og`. The card declares
// these numbers as its size, so they have to be the shape the file actually is
// — landing.test.ts reads the JPEG and checks.
export const SHARE_SHOT = {
  file: 'og.jpg',
  width: 1200,
  height: 630,
} as const

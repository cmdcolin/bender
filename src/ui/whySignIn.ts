// The prose behind both of the app's "why sign in?" cards, the panel's and the
// home page's. WhySignInDialog.tsx renders these strings in the browser, and
// index.astro renders them into the landing page at build time, so a reader
// with no JavaScript still gets the answer. Keep the file free of React and of
// the DOM so both callers can use it.

/** One thing an account buys, as a heading and the sentence under it. */
export interface Reason {
  head: string
  says: string
}

export const REASONS: Reason[] = [
  {
    head: 'Keep a board under a name',
    says: 'A voice holds the whole board: the bends, the pattern, the pedals and the tape. Press its name to bring it back, the way a synth recalls a patch.',
  },
  {
    head: 'Find it on your other machine',
    says: 'The list lives on your Google account, so a voice named on the laptop is there on the phone, and clearing site data leaves it alone.',
  },
  {
    head: 'Pick up where you left off',
    says: 'The app mirrors the board you have open onto your account, and the home page offers it back under Continue where you left off.',
  },
]

/** What works with no account, which is everything else. */
export const FREE_WITHOUT =
  'Nothing else here needs an account: presets, the dice, MIDI, recording, the sampler and every shared link all work signed out.'

/** What the account document holds. */
export const WHAT_IT_HOLDS =
  'An account holds the boards you save, plus the name and picture Google gives us. That is the whole document.'

/** How to keep a board without an account. */
export const LINKS_INSTEAD =
  'Every board is already a link, so copying one and bookmarking it keeps that board. An account adds the list: every board you keep, under a name, on every machine you sign in on.'

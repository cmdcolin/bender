// The prose behind both of the app's "why sign in?" cards, the panel's and the
// home page's. WhySignInDialog.tsx renders these strings in the browser, and
// index.astro renders them into the landing page at build time, so a reader
// with no JavaScript still gets the answer. Keep the file free of React and of
// the DOM so both callers can use it.
//
// Two sentences, and the card is over. Anyone who wants the long answer is
// already looking at the privacy page's link.

/** The answer. */
export const PITCH =
  'Sign in and you can save the board you are playing under a name, then come back to it later — on this machine or any other.'

/** What it costs, which is nothing. */
export const FREE_WITHOUT =
  'Nothing else here needs an account: presets, the dice, MIDI, recording and every shared link work signed out.'

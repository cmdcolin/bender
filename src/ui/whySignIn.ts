// The prose behind both of the app's "why sign in?" cards, the panel's and the
// home page's. WhySignInDialog.tsx renders these strings in the browser, and
// index.astro renders them into the landing page at build time, so a reader
// with no JavaScript still gets the answer. Keep the file free of React and of
// the DOM so both callers can use it.
//
// Somebody who presses save wants to know what they are being asked for and
// whether they can skip it. Both cards answer in that order and stop.

/** The answer. */
export const PITCH =
  'It’s a small thing for keeping the sounds you like. Save a board under a name and it turns up on your home page afterwards, on this machine or any other.'

/** What it costs, which is nothing. */
export const FREE_WITHOUT =
  'Skip it if you’d rather — presets, the dice, MIDI, recording and every shared link work signed out.'

/** Who you are actually signing in to. */
export const HOW = 'It’s a Google login, and the boards are stored in Firebase.'

/** The screenshot in both cards: the home page with a few voices on it. Its
    size is written into both <img> tags so the card does not reflow around it,
    and `pnpm dash` fails if the shot it takes comes out any other size. */
export const SHOT = 'dashboard.jpg'
export const SHOT_W = 982
export const SHOT_H = 749

export const SHOT_ALT =
  'The home page signed in: a card for the board you had open last, and six saved boards in a grid with the day each one was saved'

export const SHOT_CAPTION = 'Your home page, once you’re signed in.'

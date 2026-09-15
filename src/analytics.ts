// Google Analytics, on every page the site serves. It counts visits, and
// /privacy/ says what it collects and how to switch it off.
//
// The id lives here so it is written once. Every page bender serves is an Astro
// page, so components/Analytics.astro is the only reader — videoskillet keeps
// the same file, with an installer beside the id for its three Vite pages.
export const GA_ID = 'G-9C9T63Z1N2'

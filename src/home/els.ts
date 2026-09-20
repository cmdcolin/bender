// Every element the home works from, found once. The landing page renders all
// of them — some from SiteBar.astro and WhySignInCard.astro — so a missing one
// is a mistake in the page rather than a state to handle, and `need` throws.
import { need, needOf } from './dom'

export const landing = need('landing')
export const home = need('home')
export const demos = need('demos')
export const signInBtn = needOf('signIn', HTMLButtonElement)
export const acct = need('acct')
export const acctBtn = needOf('acctBtn', HTMLButtonElement)
export const acctMenu = need('acctMenu')
export const acctName = need('acctName')
export const avatar = need('avatar')
export const signOutBtn = needOf('signOut', HTMLButtonElement)
export const whyCard = needOf('whyCard', HTMLDialogElement)
export const whyBtns = [need('why')]
export const whySignInBtn = needOf('whySignIn', HTMLButtonElement)
export const whyTrouble = need('whyTrouble')

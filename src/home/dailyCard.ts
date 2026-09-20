// Today's board, at the head of the demos. It is rolled in the browser, so
// there is nothing rendered for it to play and its mark takes the slot the play
// button holds on the rest.
//
// The roll is a separate chunk — it pulls in the whole preset table — so the
// landing page paints before any of it loads.
import { el } from './dom'
import { demos } from './els'
import { markFor } from './mark'
import { boardUrl } from './paths'

export async function addDailyCard() {
  const { dailyBoard } = await import('../ui/daily')
  const today = dailyBoard(Date.now())
  const date = new Date(`${today.day}T00:00:00Z`).toLocaleDateString(
    undefined,
    {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    },
  )
  const item = el('li', 'track today')
  const mark = el('span', 'todayMark')
  mark.append(markFor(today.query))
  const text = el('span', 'trackText')
  text.append(
    el('span', 'cardName', 'Board of the day'),
    el(
      'span',
      'says',
      `${date}: a roll from the “${today.from}” preset, the same for everyone until midnight UTC.`,
    ),
  )
  const open = el('a', 'open', 'open →')
  open.href = boardUrl(today.query)
  item.append(mark, text, open)
  demos.querySelector('.tracks')?.prepend(item)
}

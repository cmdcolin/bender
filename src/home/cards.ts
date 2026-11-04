// The verbs beside a board on the home: copy, rename and delete for a named
// one, save for one the app autosaved.

import { boardUrl } from '../site/paths.ts'
import { editVoices, type CloudUser } from '../ui/cloud.ts'
import {
  VOICE_NAME_MAX,
  cleanVoiceName,
  removeVoice,
  renameVoice,
  suggestVoiceName,
  upsertVoice,
} from '../ui/voiceModel.ts'
import { el } from './dom.ts'

import type { SavedVoice } from '../ui/voiceModel.ts'

// The link a copied card carries, whole, so it opens from a chat window.
const shareLink = (query: string) =>
  new URL(boardUrl(query), location.href).href

// A voice has nothing stored beside it to clean up.
const deleted = (_user: CloudUser, _voice: SavedVoice) => undefined

// CROSS_REPO_SYNC(home-card-actions)
// What a card's verbs need: who is signed in, and how to draw the home again
// from the list an edit left on the account.
interface CardEdits {
  user: CloudUser
  redraw: (voices: SavedVoice[]) => void
}

// Copy link, rename and delete, in a row under a saved card. The row sits
// beside the card's link, since a button inside an <a> follows the link. A
// rename or a delete runs through the same transaction the app saves with, and
// the home redraws from the list that landed.
function cardActions(voice: SavedVoice, edits: CardEdits): HTMLElement {
  const row = el('div', 'cardActions')
  const status = el('span', 'cardStatus')
  status.setAttribute('role', 'status')

  const act = (label: string, run: () => void) => {
    const button = el('button', 'cardAct', label)
    button.type = 'button'
    button.addEventListener('click', run)
    return button
  }
  const show = (...nodes: HTMLElement[]) => {
    row.replaceChildren(...nodes, status)
  }
  const busy = () => {
    for (const node of row.querySelectorAll<
      HTMLButtonElement | HTMLInputElement
    >('button, input'))
      node.disabled = true
  }

  const idle = (focus?: string) => {
    const buttons = [
      act('Copy link', copy),
      act('Rename', () => {
        rename(voice.name)
      }),
      act('Delete', askDelete),
    ]
    show(...buttons)
    buttons.find(button => button.textContent === focus)?.focus()
  }

  function copy() {
    const link = shareLink(voice.query)
    // An insecure origin has no clipboard at all, and reading it throws before
    // there is a promise to reject.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(link))
      .then(
        () => {
          status.textContent = 'Link copied'
        },
        () => {
          status.textContent = 'Could not copy the link'
        },
      )
  }

  function rename(start: string) {
    const input = el('input', 'cardRename')
    input.value = start
    input.maxLength = VOICE_NAME_MAX
    input.setAttribute('aria-label', `New name for ${voice.name}`)
    const save = () => {
      const to = cleanVoiceName(input.value)
      if (to === '' || to === voice.name) {
        idle('Rename')
        return
      }
      busy()
      editVoices(edits.user.uid, list =>
        renameVoice(list, voice.name, to),
      ).then(
        next => {
          if (next.some(p => p.name === voice.name)) {
            rename(to)
            status.textContent = `Another one is already called “${to}”`
          } else edits.redraw(next)
        },
        () => {
          rename(to)
          status.textContent = 'Could not rename. Try again.'
        },
      )
    }
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') save()
      if (event.key === 'Escape') idle('Rename')
    })
    status.textContent = ''
    show(
      input,
      act('Save', save),
      act('Cancel', () => idle('Rename')),
    )
    input.select()
  }

  function askDelete() {
    status.textContent = ''
    const keep = act('Keep', () => idle('Delete'))
    show(
      el('span', 'cardAsk', `Delete “${voice.name}”?`),
      act('Delete', remove),
      keep,
    )
    keep.focus()
  }

  function remove() {
    busy()
    editVoices(edits.user.uid, list => removeVoice(list, voice.name)).then(
      next => {
        deleted(edits.user, voice)
        edits.redraw(next)
      },
      () => {
        idle('Delete')
        status.textContent = 'Could not delete. Try again.'
      },
    )
  }

  idle()
  return row
}
// CROSS_REPO_SYNC_END(home-card-actions)

// Naming an autosaved board makes it a voice. A name already taken is refused
// rather than overwriting the voice that has it.
function saveAction(
  query: string,
  voices: SavedVoice[],
  edits: CardEdits,
): HTMLElement {
  const row = el('div', 'cardActions')
  const status = el('span', 'cardStatus')
  status.setAttribute('role', 'status')

  const act = (label: string, run: () => void) => {
    const button = el('button', 'cardAct', label)
    button.type = 'button'
    button.addEventListener('click', run)
    return button
  }

  const idle = () => {
    const save = act('Save', () => {
      name(suggestVoiceName(voices, ''))
    })
    row.replaceChildren(save, status)
    return save
  }

  function name(start: string) {
    const input = el('input', 'cardRename')
    input.value = start
    input.maxLength = VOICE_NAME_MAX
    input.setAttribute('aria-label', 'Name for this board')
    const commit = () => {
      const to = cleanVoiceName(input.value)
      if (to === '') idle().focus()
      else {
        for (const node of row.querySelectorAll<
          HTMLButtonElement | HTMLInputElement
        >('button, input'))
          node.disabled = true
        editVoices(edits.user.uid, list =>
          list.some(v => v.name === to)
            ? list
            : upsertVoice(list, to, query, Date.now()),
        ).then(
          next => {
            if (next.some(v => v.name === to && v.query === query))
              edits.redraw(next)
            else {
              name(to)
              status.textContent = `Another one is already called “${to}”`
            }
          },
          () => {
            name(to)
            status.textContent = 'Could not save. Try again.'
          },
        )
      }
    }
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') commit()
      if (event.key === 'Escape') idle().focus()
    })
    status.textContent = ''
    row.replaceChildren(
      input,
      act('Save', commit),
      act('Cancel', () => idle().focus()),
      status,
    )
    input.select()
  }

  idle()
  return row
}

export { cardActions, saveAction }
export type { CardEdits }

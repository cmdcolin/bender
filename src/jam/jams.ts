import listed from './jams.json' with { type: 'json' }

const AUDIO = 'https://myloveydove.com/jam-of-the-day/'

const dateOf = (name: string) =>
  /(\d{4})(\d{2})(\d{2})/.exec(name)?.slice(1).join('-')

export const jams = listed
  .map(({ name, peaks }) => ({
    src: `${AUDIO}${name}.mp3`,
    title: dateOf(name) ?? name,
    order: dateOf(name) ?? '',
    peaks,
  }))
  .toSorted(
    (a, b) => b.order.localeCompare(a.order) || a.title.localeCompare(b.title),
  )

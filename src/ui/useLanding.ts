import { useEffect, useRef, useState } from 'react'

export function useLanding() {
  const list = useRef<HTMLOListElement>(null)
  const [land, setLand] = useState<number | null>(null)
  useEffect(() => {
    if (land !== null) {
      // oxlint-disable-next-line react/set-state-in-effect -- clears the landing once the focus is placed; the second render is a no-op
      setLand(null)
      const row = list.current?.children[land]
      if (row instanceof HTMLElement) row.focus()
    }
  }, [land])
  return { list, setLand }
}

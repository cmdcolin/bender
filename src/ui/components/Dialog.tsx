import dlg from './dialog.module.css'

import type { ComponentProps } from 'react'

const SIZE = {
  narrow: dlg.narrow,
  prose: dlg.prose,
  picture: dlg.picture,
  wide: dlg.wide,
}

export function Dialog(
  props: Omit<ComponentProps<'dialog'>, 'ref' | 'onCancel' | 'onClick'> & {
    label: string
    size: keyof typeof SIZE
    loud?: boolean
    onCancel: () => void
    onBackdrop?: () => void
    onOpen?: (el: HTMLDialogElement) => void
  },
) {
  const {
    label,
    size,
    loud,
    onCancel,
    onBackdrop,
    onOpen,
    className,
    children,
    ...rest
  } = props
  return (
    <dialog
      {...rest}
      ref={el => {
        if (el && !el.open) {
          el.showModal()
          onOpen?.(el)
        }
      }}
      onCancel={e => {
        e.preventDefault()
        onCancel()
      }}
      onClick={e => {
        if (onBackdrop && e.target === e.currentTarget) onBackdrop()
      }}
      aria-label={label}
      className={[dlg.card, SIZE[size], loud ? dlg.loud : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </dialog>
  )
}

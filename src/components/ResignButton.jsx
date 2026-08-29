import { useState } from 'react'
import Icon from './Icon.jsx'

/**
 * Resigning cannot be undone and the button sits in the nav bar over the board,
 * so it asks twice. The confirmation is inline rather than a `confirm()`
 * dialog, which would block the socket's message handling while it is open.
 */
export default function ResignButton({ disabled, onResign }) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn-secondary match__resign"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        <Icon name="flag" />
        Abandonar
      </button>
    )
  }

  return (
    <span className="resign-confirm" role="group" aria-label="Confirmar el abandono">
      <span className="resign-confirm__question text-muted">¿Seguro?</span>
      <button
        type="button"
        className="btn btn-danger"
        disabled={disabled}
        onClick={() => {
          setConfirming(false)
          onResign()
        }}
      >
        Sí, abandono
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setConfirming(false)}
      >
        Cancelar
      </button>
    </span>
  )
}

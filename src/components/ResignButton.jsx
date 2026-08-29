import { useState } from 'react'

/**
 * Resigning cannot be undone and the button sits next to the board, so it asks
 * twice. The confirmation is inline rather than a `confirm()` dialog, which
 * would block the socket's message handling while it is open.
 */
export default function ResignButton({ disabled, onResign }) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        className="button--quiet"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        Rendirse
      </button>
    )
  }

  return (
    <span className="resign-confirm" role="group" aria-label="Confirmar la rendición">
      <span className="resign-confirm__question">¿Seguro?</span>
      <button
        type="button"
        className="button--danger"
        disabled={disabled}
        onClick={() => {
          setConfirming(false)
          onResign()
        }}
      >
        Sí, me rindo
      </button>
      <button type="button" className="button--quiet" onClick={() => setConfirming(false)}>
        Cancelar
      </button>
    </span>
  )
}

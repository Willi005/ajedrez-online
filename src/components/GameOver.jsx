import { useEffect, useRef } from 'react'

/**
 * Reads an outcome from the local player's point of view.
 *
 * `winner` is a colour because that is what the server sends; who won is only
 * meaningful once it is compared with the colour this browser is playing.
 * `checkmate` and `draw` never come from the server — the protocol has no
 * message for them, so each client detects them from its own board.
 */
function describeOutcome({ reason, winner }, myColor) {
  if (reason === 'opponent_left') {
    return {
      tone: 'neutral',
      headline: 'Tu rival abandonó la partida',
      detail: 'Se cortó su conexión o cerró la página. La sala ya no existe.',
    }
  }

  if (reason === 'draw') {
    return {
      tone: 'neutral',
      headline: 'Tablas',
      detail: 'La posición no permite avanzar: ahogado, material insuficiente o repetición.',
    }
  }

  const won = winner === myColor

  if (reason === 'checkmate') {
    return {
      tone: won ? 'win' : 'loss',
      headline: won ? 'Ganaste por jaque mate' : 'Perdiste por jaque mate',
      detail: won
        ? 'El rey rival está en jaque y no tiene salida.'
        : 'Tu rey está en jaque y no tiene salida.',
    }
  }

  if (reason === 'resign') {
    return {
      tone: won ? 'win' : 'loss',
      headline: won ? 'Ganaste: tu rival se rindió' : 'Te rendiste',
      detail: won ? 'Tu rival abandonó la partida.' : 'La partida terminó a favor de tu rival.',
    }
  }

  return {
    tone: 'neutral',
    headline: 'Partida terminada',
    detail: `Motivo informado por el servidor: ${reason}.`,
  }
}

/** The end-of-game card. The board stays on screen behind it, still readable. */
export default function GameOver({ outcome, myColor, onReturn }) {
  const headingRef = useRef(null)

  // Move focus here so the result is announced and the next action is one Tab
  // away. The board behind is locked by then, so nothing is stolen mid-move.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const { tone, headline, detail } = describeOutcome(outcome, myColor)

  return (
    <section className={`game-over game-over--${tone}`} role="status" aria-atomic="true">
      <h2 className="game-over__headline" ref={headingRef} tabIndex={-1}>
        {headline}
      </h2>
      <p className="game-over__detail">{detail}</p>
      <button type="button" className="button--primary" onClick={onReturn}>
        Volver al inicio
      </button>
    </section>
  )
}

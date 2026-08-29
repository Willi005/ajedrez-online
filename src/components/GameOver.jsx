import { useEffect, useRef } from 'react'
import CopyButton from './CopyButton.jsx'

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
      headline: 'Tu rival abandonó la partida',
      detail: 'Se cortó su conexión o cerró la página. La sala ya no existe.',
    }
  }

  if (reason === 'draw') {
    return {
      headline: 'Tablas',
      detail: 'La posición no permite avanzar: ahogado, material insuficiente o repetición.',
    }
  }

  const won = winner === myColor

  if (reason === 'checkmate') {
    return {
      headline: won ? 'Ganas la partida' : 'Pierdes la partida',
      detail: won
        ? 'Jaque mate. El rey rival no tiene salida.'
        : 'Jaque mate. Tu rey no tiene salida.',
    }
  }

  if (reason === 'resign') {
    return {
      headline: won ? 'Ganas la partida' : 'Te rendiste',
      detail: won
        ? 'Tu rival se rindió.'
        : 'La partida terminó a favor de tu rival.',
    }
  }

  return {
    headline: 'Partida terminada',
    detail: `Motivo informado por el servidor: ${reason}.`,
  }
}

/**
 * The Fin artboard: a modal at the top elevation, with the board still readable
 * behind it.
 *
 * The maquette's third action is a rematch, which would need a message the
 * protocol does not have. Its slot goes to dismissing the dialog instead — the
 * players are still in the room and can still talk to each other after the last
 * move, and a modal that cannot be closed would take that away.
 */
export default function GameOver({ outcome, myColor, moveCount, token, getPgn, onReturn, onDismiss }) {
  const headingRef = useRef(null)

  // Move focus here so the result is announced and the actions are one Tab
  // away. The board behind is locked by then, so nothing is stolen mid-move.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const { headline, detail } = describeOutcome(outcome, myColor)

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
        <p className="card-kicker">Fin de la partida</p>

        <h2 className="dialog-title" id="game-over-title" ref={headingRef} tabIndex={-1}>
          {headline}
        </h2>

        <p className="dialog-body">{detail}</p>

        <hr className="hr" />

        <div className="dialog-meta text-muted tnum">
          <span>{moveCount === 1 ? '1 jugada' : `${moveCount} jugadas`}</span>
          <span>Sala {token}</span>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onReturn}>
            Salir
          </button>
          <CopyButton
            className="btn btn-secondary"
            label="Copiar PGN"
            copiedLabel="PGN copiado"
            getText={getPgn}
            disabled={moveCount === 0}
          />
          <button type="button" className="btn btn-primary" onClick={onDismiss}>
            Seguir aquí
          </button>
        </div>
      </div>
    </div>
  )
}

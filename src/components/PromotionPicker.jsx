import { PIECE_NAMES } from '../lib/pieces.js'
import Piece from './Piece.jsx'

// Offer the pieces in the order players actually want them.
const PIECE_ORDER = ['q', 'r', 'b', 'n']

/**
 * Asked before a pawn move that reaches the last rank is sent.
 *
 * A dialog rather than a strip under the board: it is the one moment the game
 * genuinely stops and waits for an answer, which is what the design system's
 * modal is for.
 */
export default function PromotionPicker({ choices, color, onSelect, onCancel }) {
  const available = PIECE_ORDER.filter((piece) => choices.includes(piece))

  return (
    <div className="dialog-backdrop">
      <div className="dialog promotion" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
        <p className="card-kicker">Coronación</p>
        <h2 className="dialog-title" id="promotion-title">
          Elige la pieza
        </h2>

        <div className="promotion__options">
          {available.map((piece) => (
            <button
              key={piece}
              type="button"
              className="btn btn-secondary promotion__option"
              aria-label={PIECE_NAMES[piece]}
              onClick={() => onSelect(piece)}
            >
              <Piece type={piece} color={color} />
              <span className="promotion__name">{PIECE_NAMES[piece]}</span>
            </button>
          ))}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancelar la jugada
          </button>
        </div>
      </div>
    </div>
  )
}

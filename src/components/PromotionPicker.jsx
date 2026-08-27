import { PIECE_NAMES } from '../lib/pieces.js'
import Piece from './Piece.jsx'

// Offer the pieces in the order players actually want them.
const PIECE_ORDER = ['q', 'r', 'b', 'n']

/** Asked before a pawn move that reaches the last rank is sent. */
export default function PromotionPicker({ choices, color, onSelect, onCancel }) {
  const available = PIECE_ORDER.filter((piece) => choices.includes(piece))

  return (
    <div className="promotion">
      <p>Elige la pieza de promoción:</p>
      <div className="row">
        {available.map((piece) => (
          <button
            key={piece}
            type="button"
            className="promotion__option"
            aria-label={PIECE_NAMES[piece]}
            onClick={() => onSelect(piece)}
          >
            <Piece type={piece} color={color} />
            <span className="promotion__name">{PIECE_NAMES[piece]}</span>
          </button>
        ))}
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

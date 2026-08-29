import { describePiece } from '../lib/pieces.js'
import Piece from './Piece.jsx'
import './Board.css'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1]

function isLightSquare(file, rank) {
  return (FILES.indexOf(file) + rank) % 2 === 0
}

function describeSquare(square, piece) {
  if (!piece) return `Casilla ${square}, vacía`
  return `Casilla ${square}, ${describePiece(piece.type, piece.color)}`
}

/**
 * The 8x8 board, drawn as a CSS Grid inside a coordinate frame.
 *
 * The maquette sets the ranks and files outside the board rather than in the
 * corners of the squares, so the squares hold nothing but the position and the
 * board keeps a clean edge. That is what the frame grid around it is for.
 *
 * Purely presentational: it renders the position it is handed and reports
 * clicks by square name. Which squares may be clicked is decided upstream,
 * where the turn and the game phase are known.
 */
export default function Board({
  board,
  orientation = 'white',
  selectedSquare = null,
  legalTargets = [],
  lastMove = null,
  interactive = false,
  onSquareClick,
}) {
  const files = orientation === 'black' ? [...FILES].reverse() : FILES
  const ranks = orientation === 'black' ? [...RANKS].reverse() : RANKS
  const targets = new Set(legalTargets)

  return (
    <div className="board-frame">
      <div className="board-frame__ranks" aria-hidden="true">
        {ranks.map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>

      <div className="board" role="grid" aria-label="Tablero de ajedrez">
        {ranks.map((rank) => (
          <div className="board__row" role="row" key={rank}>
            {files.map((file) => {
              const square = `${file}${rank}`
              // board() is always indexed from rank 8 down and file a across,
              // whichever way the board is drawn.
              const piece = board[8 - rank][FILES.indexOf(file)]
              const classes = [
                'square',
                isLightSquare(file, rank) ? 'square--light' : 'square--dark',
              ]
              if (lastMove && (square === lastMove.from || square === lastMove.to)) {
                classes.push('square--last')
              }
              if (square === selectedSquare) classes.push('square--selected')
              if (targets.has(square)) {
                classes.push(piece ? 'square--capture' : 'square--target')
              }

              return (
                <button
                  type="button"
                  role="gridcell"
                  key={square}
                  className={classes.join(' ')}
                  disabled={!interactive}
                  aria-label={describeSquare(square, piece)}
                  onClick={() => onSquareClick?.(square)}
                >
                  {piece && <Piece type={piece.type} color={piece.color} />}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div />

      <div className="board-frame__files" aria-hidden="true">
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
    </div>
  )
}

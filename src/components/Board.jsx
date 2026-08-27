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
 * The 8x8 board, drawn as a CSS Grid.
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
            if (square === selectedSquare) classes.push('square--selected')
            if (targets.has(square)) {
              classes.push(piece ? 'square--capture' : 'square--target')
            }
            if (lastMove && (square === lastMove.from || square === lastMove.to)) {
              classes.push('square--last')
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
                {file === files[0] && <span className="square__rank">{rank}</span>}
                {rank === ranks[ranks.length - 1] && (
                  <span className="square__file">{file}</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

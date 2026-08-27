import { useState } from 'react'
import Board from './Board.jsx'
import PromotionPicker from './PromotionPicker.jsx'

/**
 * The playing view: the board, whose turn it is, and the click-to-move flow.
 *
 * Turn ownership is enforced here as well as on the server. The server would
 * reject an out-of-turn move with NOT_YOUR_TURN, but waiting for that round trip
 * to find out would let the board move under the player's hands first.
 */
export default function GameScreen({ game, room, isGameActive, onMove }) {
  const { state, getLegalTargets, getPromotionChoices, pieceAt } = game

  const [selected, setSelected] = useState(null)
  const [pending, setPending] = useState(null) // A promotion awaiting a choice.
  const [renderedFen, setRenderedFen] = useState(state.fen)

  const myColor = room.color === 'white' ? 'w' : 'b'
  const isMyTurn = isGameActive && state.turn === myColor

  // A move by either side invalidates whatever was selected. Adjusting during
  // render rather than in an effect avoids painting the stale highlights first.
  if (renderedFen !== state.fen) {
    setRenderedFen(state.fen)
    setSelected(null)
    setPending(null)
  }

  // Recomputed every render on purpose: the engine is mutable, so a cached
  // list could describe a position that is no longer on the board.
  const legalTargets = selected ? getLegalTargets(selected) : []

  function submit(from, to, promotion) {
    setSelected(null)
    setPending(null)
    onMove({ from, to, promotion })
  }

  function handleSquareClick(square) {
    if (!isMyTurn || pending) return

    if (selected) {
      if (square === selected) {
        setSelected(null)
        return
      }
      if (legalTargets.includes(square)) {
        const choices = getPromotionChoices(selected, square)
        if (choices.length > 0) {
          setPending({ from: selected, to: square, choices })
          return
        }
        submit(selected, square, null)
        return
      }
    }

    // Not a move: treat the click as picking up one of your own pieces.
    const piece = pieceAt(square)
    setSelected(piece && piece.color === myColor ? square : null)
  }

  return (
    <div className="game">
      <header className="game__header">
        <p>
          <strong>{room.nickname}</strong> ({room.color === 'white' ? 'blancas' : 'negras'})
          {' vs '}
          <strong>{room.opponent}</strong>
        </p>
        <p className="game__turn">
          {!isGameActive
            ? 'Partida detenida.'
            : isMyTurn
              ? 'Tu turno.'
              : `Turno de ${room.opponent}.`}
          {isGameActive && state.inCheck && ' ¡Jaque!'}
        </p>
      </header>

      <Board
        board={state.board}
        orientation={room.color}
        selectedSquare={selected}
        legalTargets={legalTargets}
        lastMove={state.lastMove}
        interactive={isMyTurn && !pending}
        onSquareClick={handleSquareClick}
      />

      {pending && (
        <PromotionPicker
          choices={pending.choices}
          color={myColor}
          onSelect={(piece) => submit(pending.from, pending.to, piece)}
          onCancel={() => setPending(null)}
        />
      )}

      <p className="game__token">
        Token de la partida: <code>{room.token}</code>
      </p>
    </div>
  )
}

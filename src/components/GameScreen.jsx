import { useState } from 'react'
import Avatar from './Avatar.jsx'
import Board from './Board.jsx'
import Chat from './Chat.jsx'
import MoveHistory from './MoveHistory.jsx'
import PromotionPicker from './PromotionPicker.jsx'
import ResignButton from './ResignButton.jsx'

/**
 * The Partida artboard: a nav bar over three columns — the move list, the
 * board, the chat.
 *
 * Turn ownership is enforced here as well as on the server. The server would
 * reject an out-of-turn move with NOT_YOUR_TURN, but waiting for that round trip
 * to find out would let the board move under the player's hands first.
 *
 * Three things the maquette puts in the nav are not here. Offering a draw and
 * a rematch would both need a message the protocol does not have — section 4 of
 * the bitácora lists every one of them — and the clocks in the seat rows would
 * need a server that keeps time, which this one deliberately does not: it
 * validates the network and the session and nothing else. The clock's slot is
 * kept, and carries the one thing it was really there to say, which is who is
 * on the move.
 */

/** A player, their colour, and whether the board is waiting on them. */
function Seat({ nickname, color, isToMove, isYou }) {
  return (
    <div className={`seat${isToMove ? ' seat--to-move' : ''}`}>
      <Avatar nickname={nickname} color={color} />
      <span className="seat__name">{nickname}</span>
      <span className="tag tag-neutral">{color === 'white' ? 'blancas' : 'negras'}</span>
      {isYou && <span className="tag tag-neutral seat__you">tú</span>}
      <span className={`seat__turn${isToMove ? ' seat__turn--active' : ''}`}>
        {isToMove ? 'Mueve' : '—'}
      </span>
    </div>
  )
}

export default function GameScreen({
  game,
  room,
  isGameActive,
  statusText,
  chat,
  onMove,
  onResign,
}) {
  const { state, getLegalTargets, getPromotionChoices, pieceAt, getPgn } = game

  const [selected, setSelected] = useState(null)
  const [pending, setPending] = useState(null) // A promotion awaiting a choice.
  const [renderedFen, setRenderedFen] = useState(state.fen)

  const myColor = room.color === 'white' ? 'w' : 'b'
  const opponentColor = room.color === 'white' ? 'black' : 'white'
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
    <div className="match">
      <nav className="nav match__nav">
        <span className="nav-brand">Gambito</span>
        <span className="tag tag-neutral match__room tnum">Sala {room.token}</span>
        <span className="match__status" role="status" aria-atomic="true">
          {statusText}
        </span>
        <ResignButton disabled={!isGameActive} onResign={onResign} />
      </nav>

      <div className="match__body">
        <MoveHistory history={state.history} board={state.board} getPgn={getPgn} />

        <div className="match__board">
          <Seat
            nickname={room.opponent}
            color={opponentColor}
            isToMove={isGameActive && !isMyTurn}
          />

          <Board
            board={state.board}
            orientation={room.color}
            selectedSquare={selected}
            legalTargets={legalTargets}
            lastMove={state.lastMove}
            interactive={isMyTurn && !pending}
            onSquareClick={handleSquareClick}
          />

          <Seat nickname={room.nickname} color={room.color} isToMove={isMyTurn} isYou />

          {isGameActive && state.inCheck && (
            <p className="match__check" role="status" aria-atomic="true">
              ¡Jaque!
            </p>
          )}
        </div>

        <Chat {...chat} />
      </div>

      {pending && (
        <PromotionPicker
          choices={pending.choices}
          color={myColor}
          onSelect={(piece) => submit(pending.from, pending.to, piece)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}

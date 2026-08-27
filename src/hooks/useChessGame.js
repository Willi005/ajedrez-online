import { Chess } from 'chess.js'
import { useCallback, useState } from 'react'

/**
 * The chess rules, which by design 2.3 of the bitácora live entirely in the
 * client: the server validates network and session concerns and never learns
 * how a bishop moves.
 *
 * The `Chess` instance is mutable and must survive re-renders, so it is created
 * once by a state initialiser and never replaced; every mutation is followed by
 * a fresh immutable snapshot that React can render.
 */

function snapshot(game, lastMove) {
  return {
    fen: game.fen(),
    turn: game.turn(), // 'w' or 'b'
    board: game.board(),
    inCheck: game.inCheck(),
    isGameOver: game.isGameOver(),
    isCheckmate: game.isCheckmate(),
    isDraw: game.isDraw(),
    lastMove,
  }
}

export function useChessGame() {
  const [game] = useState(() => new Chess())
  const [state, setState] = useState(() => snapshot(game, null))

  const reset = useCallback(() => {
    game.reset()
    setState(snapshot(game, null))
  }, [game])

  /** Squares the piece on `square` may legally move to right now. */
  const getLegalTargets = useCallback(
    (square) => {
      if (!square) return []
      const moves = game.moves({ square, verbose: true })
      return [...new Set(moves.map((move) => move.to))]
    },
    [game],
  )

  /**
   * The promotion pieces available for this move, or an empty array when the
   * move is not a promotion. chess.js reports one legal move per piece.
   */
  const getPromotionChoices = useCallback(
    (from, to) => {
      const moves = game.moves({ square: from, verbose: true })
      return moves
        .filter((move) => move.to === to && move.promotion)
        .map((move) => move.promotion)
    },
    [game],
  )

  const pieceAt = useCallback((square) => game.get(square) || null, [game])

  /**
   * Play the local player's move. Returns the payload to put on the wire, or
   * null when chess.js rejects the move as illegal.
   */
  const makeMove = useCallback(
    ({ from, to, promotion }) => {
      let move
      try {
        move = game.move({ from, to, promotion: promotion || undefined })
      } catch {
        return null // Illegal: chess.js throws rather than returning null.
      }

      const fen = game.fen()
      setState(snapshot(game, { from: move.from, to: move.to }))
      return {
        from: move.from,
        to: move.to,
        promotion: move.promotion ?? null,
        fen,
      }
    },
    [game],
  )

  /**
   * Take back the last move.
   *
   * Used when a move was played locally but could not be put on the wire: the
   * opponent will never see it, so leaving it on our board would desynchronise
   * the two positions.
   */
  const undoLastMove = useCallback(() => {
    if (!game.undo()) return false
    setState(snapshot(game, null))
    return true
  }, [game])

  /**
   * Apply a move relayed from the opponent.
   *
   * The move is replayed locally so that history and highlights stay intact,
   * but the FEN the opponent computed is the authority: if the two ever
   * disagree, the position is reloaded from it rather than left to drift.
   */
  const applyOpponentMove = useCallback(
    ({ from, to, promotion, fen }) => {
      let applied = false
      try {
        game.move({ from, to, promotion: promotion || undefined })
        applied = true
      } catch {
        applied = false
      }

      if (!applied || (fen && game.fen() !== fen)) {
        try {
          game.load(fen)
        } catch {
          setState(snapshot(game, { from, to }))
          return false
        }
      }

      setState(snapshot(game, { from, to }))
      return true
    },
    [game],
  )

  return {
    state,
    reset,
    getLegalTargets,
    getPromotionChoices,
    pieceAt,
    makeMove,
    undoLastMove,
    applyOpponentMove,
  }
}

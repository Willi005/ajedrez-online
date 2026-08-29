/** Spanish names for the pieces, used in accessible labels and in the UI. */

export const PIECE_NAMES = {
  k: 'rey',
  q: 'dama',
  r: 'torre',
  b: 'alfil',
  n: 'caballo',
  p: 'peón',
}

export const COLOR_NAMES = { w: 'blanco', b: 'negro' }

export function describePiece(type, color) {
  return `${PIECE_NAMES[type]} ${COLOR_NAMES[color]}`
}

/** The conventional relative values, used only to total up what is off the board. */
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** What each side starts with. */
const INITIAL_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }

/**
 * The pieces missing from the board, per colour, heaviest first.
 *
 * Counted from the position rather than replayed from the move list on purpose:
 * a resynchronisation loads a FEN, which leaves chess.js with no history at
 * all, and the board is the one thing that is always right.
 *
 * `advantage` is the material difference in the usual pawn units, positive when
 * White is ahead.
 */
const CAPTURE_ORDER = ['q', 'r', 'b', 'n', 'p']

export function capturedMaterial(board) {
  const present = { w: {}, b: {} }

  for (const row of board) {
    for (const square of row) {
      if (!square) continue
      present[square.color][square.type] = (present[square.color][square.type] ?? 0) + 1
    }
  }

  function missing(color) {
    const result = []
    for (const type of CAPTURE_ORDER) {
      const gone = INITIAL_COUNTS[type] - (present[color][type] ?? 0)
      // A promotion can leave more of a piece on the board than the game began
      // with, which would otherwise show up here as a negative count.
      if (gone > 0) result.push({ type, count: gone })
    }
    return result
  }

  function total(list) {
    return list.reduce((sum, { type, count }) => sum + PIECE_VALUES[type] * count, 0)
  }

  // A piece missing from White is a piece Black captured, so the lists are
  // named for whoever took them.
  const takenByBlack = missing('w')
  const takenByWhite = missing('b')

  return {
    white: takenByWhite,
    black: takenByBlack,
    advantage: total(takenByWhite) - total(takenByBlack),
  }
}

/**
 * English SAN as Spanish algebraic notation: Nf3 becomes Cf3, Bxc4 becomes Axc4.
 *
 * The interface is in Spanish and so is the maquette's move list, but PGN is
 * standardised on the English letters — a Spanish PGN would not open in any
 * other program — so the translation happens here, on the way to the screen,
 * and never on the way to the clipboard.
 */
const SAN_LETTERS = { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' }

export function toSpanishSan(san) {
  if (!san) return san
  // Castling is written the same way in both languages.
  if (san.startsWith('O-O')) return san

  // Only two positions can hold a piece letter: the first character, and the
  // one after the '=' of a promotion. Everything else is a file, a rank or a
  // mark, and must be left alone.
  return san
    .replace(/^[KQRBN]/, (letter) => SAN_LETTERS[letter])
    .replace(/=([KQRBN])/, (_, letter) => `=${SAN_LETTERS[letter]}`)
}

/**
 * The move list as the rows of the table the maquette draws: one row per full
 * move, White's move and Black's reply side by side.
 */
export function toMoveRows(history) {
  const rows = []
  for (let index = 0; index < history.length; index += 2) {
    rows.push({
      number: index / 2 + 1,
      white: toSpanishSan(history[index]),
      black: history[index + 1] ? toSpanishSan(history[index + 1]) : null,
    })
  }
  return rows
}

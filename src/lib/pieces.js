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

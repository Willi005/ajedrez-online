import Piece from './Piece.jsx'

/**
 * The app's mark: a pawn in a black disc.
 *
 * It is the same pawn that is on the board, not a second drawing of one, so the
 * mark and the game cannot drift apart. Its stroke is set to the disc's own
 * colour, which leaves a clean pale silhouette instead of an outline that would
 * disappear into the black anyway.
 */
export default function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <Piece type="p" color="w" />
    </span>
  )
}

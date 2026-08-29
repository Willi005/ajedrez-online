import { capturedMaterial, toMoveRows } from '../lib/pieces.js'
import CopyButton from './CopyButton.jsx'
import Piece from './Piece.jsx'

/**
 * What one side has taken, drawn with the pieces that are on the board.
 *
 * `color` is the colour of the captured pieces, which is the opposite of the
 * side named by the label: the row headed "Blancas" holds the black pieces
 * White has taken.
 */
function CapturedRow({ label, color, taken, edge }) {
  return (
    <div className="captured__row">
      <span className="captured__label text-muted">{label}</span>

      {taken.length === 0 ? (
        <span className="text-muted">—</span>
      ) : (
        <span className="captured__pieces">
          {taken.flatMap(({ type, count }) =>
            // One glyph per piece rather than a "x3": three pawns should look
            // like three pawns.
            Array.from({ length: count }, (_, index) => (
              <Piece key={`${type}-${index}`} type={type} color={color} className="piece--taken" />
            )),
          )}
        </span>
      )}

      {edge > 0 && (
        <span className="captured__edge tnum" title="Ventaja material">
          +{edge}
        </span>
      )}
    </div>
  )
}

/**
 * The left column of the Partida artboard: the move list, then what has come
 * off the board.
 *
 * Two things the maquette draws here are not implemented, and both are
 * functionality rather than design. The ⟨ ⟩ pair steps back through the game,
 * which means a second position on screen that is not the one being played and
 * a rule for what happens when a move arrives mid-rewind. And the detected
 * opening needs an opening book the app does not carry.
 *
 * The move list is in Spanish notation; the PGN on the clipboard is not. See
 * `toSpanishSan` for why.
 */
export default function MoveHistory({ history, board, getPgn }) {
  const rows = toMoveRows(history)
  const captured = capturedMaterial(board)
  const lastPly = history.length

  return (
    <section className="panel panel--history" aria-label="Historial de la partida">
      <div className="panel__head">
        <h5 className="panel__title">Historial</h5>
        <span className="panel__count text-muted tnum">
          {rows.length === 1 ? '1 jugada' : `${rows.length} jugadas`}
        </span>
      </div>

      <div className="table-frame">
        <table className="table history">
          <thead>
            <tr>
              <th className="history__number">#</th>
              <th>Blancas</th>
              <th>Negras</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="text-muted history__empty" colSpan={3}>
                  Todavía no se ha jugado nada.
                </td>
              </tr>
            )}
            {rows.map((row, index) => {
              // The most recent ply, marked the way the maquette marks it.
              const whitePly = index * 2 + 1
              const blackPly = whitePly + 1
              return (
                <tr key={row.number}>
                  <td className="text-muted tnum">{row.number}.</td>
                  <td className={`history__san${whitePly === lastPly ? ' history__san--last' : ''}`}>
                    {row.white}
                  </td>
                  <td className={`history__san${blackPly === lastPly ? ' history__san--last' : ''}`}>
                    {row.black ?? ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="panel__actions">
        <CopyButton
          className="btn btn-ghost"
          label="Copiar PGN"
          copiedLabel="PGN copiado"
          getText={getPgn}
          disabled={history.length === 0}
        />
      </div>

      <hr className="hr" />

      <p className="card-kicker">Piezas capturadas</p>
      <div className="captured">
        <CapturedRow
          label="Blancas"
          color="b"
          taken={captured.white}
          edge={captured.advantage}
        />
        <CapturedRow
          label="Negras"
          color="w"
          taken={captured.black}
          edge={-captured.advantage}
        />
      </div>
    </section>
  )
}

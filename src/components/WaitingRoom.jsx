import { INITIAL_TIME_SECONDS } from '../lib/clock.js'
import CopyButton from './CopyButton.jsx'

/**
 * The Crear sala artboard: shown to the creator between `created` and `start`,
 * so the token is on screen to be read aloud or copied to the opponent.
 *
 * The maquette's primary action here is "Ir a la sala de espera". There is no
 * such step: this *is* the waiting room, and what advances it is the opponent
 * arriving, not a button. So the button slot carries the one action that is
 * really available — closing the room — and the pulse the maquette uses on its
 * reconnection strip carries the waiting.
 *
 * Its share-link row is gone with it. The app is served straight off a dev
 * server on a LAN address and has no route that takes a token, so a link would
 * be a promise it cannot keep; the token is the thing that gets shared.
 */
export default function WaitingRoom({ token, onCancel }) {
  return (
    <div className="sheet">
      <header className="sheet__head">
        <p className="kicker">Sala creada</p>
        <h2 className="sheet__title">Tu token de la partida</h2>
      </header>

      <div className="card elev-sm sheet__card">
        <div className="token-row">
          <p className="token-display tnum">{token}</p>
          <CopyButton getText={() => token} />
        </div>

        <hr className="hr" />

        <p className="card-body">
          Compártelo por donde quieras. Quien tenga el token entra a esta sala, y
          solo caben dos.
        </p>

        <p className="waiting" role="status">
          <span className="pulse-dot" aria-hidden="true" />
          <span>Esperando a que tu rival se una…</span>
          <span className="tag tag-neutral waiting__side">
            Blancas · {INITIAL_TIME_SECONDS / 60} min
          </span>
        </p>

        <button type="button" className="btn btn-secondary btn-block" onClick={onCancel}>
          Cerrar la sala
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import {
  MAX_NICKNAME_LENGTH,
  TOKEN_LENGTH,
  isValidNickname,
  isValidToken,
  normalizeNickname,
  normalizeToken,
} from '../lib/protocol.js'

/**
 * The Inicio artboard: an editorial column on the left, the one form on the
 * right.
 *
 * The maquette draws joining a room as a screen of its own, but it also puts a
 * segmented control on this card that switches between creating and joining.
 * The two cannot both be true, and the segmented control is the interactive
 * one, so the join fields open inside this card — set the way the Unirse
 * artboard sets them, large and letter-spaced — instead of behind a navigation
 * step the protocol has no use for.
 *
 * The nickname lives here rather than on a gate screen of its own for the same
 * reason: the maquette asks for it in this card, next to the choice it belongs
 * to. It is still remembered between visits; the caller persists it.
 */
const MODE = { CREATE: 'create', JOIN: 'join' }

export default function Home({ nickname, canAct, onCreate, onJoin }) {
  const [name, setName] = useState(nickname ?? '')
  const [mode, setMode] = useState(MODE.CREATE)
  const [token, setToken] = useState('')

  const hasName = isValidNickname(name)
  const canSubmit =
    canAct && hasName && (mode === MODE.CREATE || isValidToken(token))

  function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return

    const player = normalizeNickname(name)
    if (mode === MODE.CREATE) onCreate(player)
    else onJoin(player, normalizeToken(token))
  }

  return (
    <div className="home">
      <div className="home__intro">
        <p className="kicker">Ajedrez en línea · uno contra uno</p>
        <h1 className="home__title">Gambito</h1>
        <p className="home__lede">
          Una mesa para dos. Escribe tu apodo, crea una sala y pásale el token a
          tu rival. Nadie se registra y nada se guarda: cuando los dos estén
          sentados, empieza la partida.
        </p>

        <hr className="hr home__rule" />

        <ol className="steps">
          <li className="steps__item">
            <span className="steps__numeral">I</span>
            <span>Elige un apodo. Es lo único que verá tu rival.</span>
          </li>
          <li className="steps__item">
            <span className="steps__numeral">II</span>
            <span>Crea la sala y copia el token de la partida.</span>
          </li>
          <li className="steps__item">
            <span className="steps__numeral">III</span>
            <span>Tu rival lo pega, entra, y juegan con historial y chat al lado.</span>
          </li>
        </ol>
      </div>

      <div className="home__panel">
        <form className="card elev-sm home__form" onSubmit={handleSubmit}>
          <p className="card-kicker">Sentarse a la mesa</p>
          <h3 className="home__form-title">Entrar</h3>

          <div className="field">
            <label htmlFor="nickname">Apodo</label>
            <input
              className="input"
              id="nickname"
              type="text"
              value={name}
              maxLength={MAX_NICKNAME_LENGTH}
              autoComplete="off"
              autoFocus
              placeholder="p. ej. Capablanca_77"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="mode-create">¿Qué quieres hacer?</label>
            <div className="seg home__seg">
              <label className="seg-opt" htmlFor="mode-create">
                <input
                  id="mode-create"
                  type="radio"
                  name="mode"
                  checked={mode === MODE.CREATE}
                  onChange={() => setMode(MODE.CREATE)}
                />
                <span>Crear sala</span>
              </label>
              <label className="seg-opt" htmlFor="mode-join">
                <input
                  id="mode-join"
                  type="radio"
                  name="mode"
                  checked={mode === MODE.JOIN}
                  onChange={() => setMode(MODE.JOIN)}
                />
                <span>Unirme con token</span>
              </label>
            </div>
          </div>

          {mode === MODE.JOIN && (
            <div className="field">
              <label htmlFor="token">Token de la partida</label>
              <input
                className="input token-input"
                id="token"
                type="text"
                value={token}
                maxLength={TOKEN_LENGTH}
                autoComplete="off"
                spellCheck="false"
                placeholder="7QK2P"
                onChange={(event) => setToken(event.target.value.toUpperCase())}
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit}>
            {mode === MODE.CREATE ? 'Crear la sala' : 'Unirme a la sala'}
          </button>

          <p className="home__fineprint text-muted">
            {canAct
              ? 'Sin cuenta, sin correo. El token deja de existir cuando termina la partida.'
              : 'Sin conexión con el servidor. Revisa la dirección más abajo.'}
          </p>
        </form>
      </div>
    </div>
  )
}

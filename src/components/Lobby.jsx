import { useState } from 'react'
import { TOKEN_LENGTH, isValidToken, normalizeToken } from '../lib/protocol.js'

/**
 * Create a game or join one with a token. Pairing is manual by design 2.4: the
 * creator reads the token out to their opponent.
 */
export default function Lobby({ nickname, canAct, onCreate, onJoin, onChangeNickname }) {
  const [token, setToken] = useState('')

  const canJoin = canAct && isValidToken(token)

  function handleJoin(event) {
    event.preventDefault()
    if (!canJoin) return
    onJoin(normalizeToken(token))
  }

  return (
    <div className="lobby">
      <p className="greeting">
        Juegas como <strong>{nickname}</strong>{' '}
        <button type="button" className="link" onClick={onChangeNickname}>
          cambiar
        </button>
      </p>

      <section className="section">
        <h2 className="section__title">Crear una partida</h2>
        <p className="hint">
          Obtendrás un token de {TOKEN_LENGTH} caracteres para pasarle a tu rival.
          Juegas con blancas.
        </p>
        <button type="button" disabled={!canAct} onClick={onCreate}>
          Crear partida
        </button>
      </section>

      <section className="section">
        <h2 className="section__title">Unirse a una partida</h2>
        <form onSubmit={handleJoin}>
          <label htmlFor="token">Token de la partida</label>
          <input
            id="token"
            type="text"
            value={token}
            maxLength={TOKEN_LENGTH}
            autoComplete="off"
            spellCheck="false"
            placeholder="7QK2P"
            className="token-input"
            onChange={(event) => setToken(event.target.value.toUpperCase())}
          />
          <button type="submit" disabled={!canJoin}>
            Unirse
          </button>
        </form>
      </section>

      {!canAct && (
        <p className="hint">
          Sin conexión con el servidor. Revisa la dirección más abajo.
        </p>
      )}
    </div>
  )
}

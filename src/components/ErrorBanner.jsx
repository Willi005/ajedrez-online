import Icon from './Icon.jsx'

/**
 * Turns a server error into something the player can act on.
 *
 * Section 4.3 of the bitácora promises the `code` is stable while the `message`
 * is free text, so the code is what gets matched here. Anything unmapped falls
 * back to the server's own wording rather than to a generic apology: an
 * unexpected code is exactly when the real text is worth reading.
 *
 * Drawn as the full-width strip the maquette uses under the nav bar for its
 * reconnection notice, in the danger ramp rather than the accent one.
 */
const RECOVERY = {
  ROOM_NOT_FOUND: {
    title: 'No existe ninguna partida con ese token',
    hint: 'Revisa que esté bien escrito. Los tokens se pierden cuando quien creó la partida cierra la página.',
  },
  ROOM_FULL: {
    title: 'Esa partida ya tiene dos jugadores',
    hint: 'Pídele a tu rival que cree una nueva y te pase el token.',
  },
  INVALID_TOKEN_FORMAT: {
    title: 'El token no tiene el formato correcto',
    hint: 'Son 5 caracteres. No se usan las letras I, L ni O, ni los números 0 y 1.',
  },
  INVALID_NICKNAME: {
    title: 'Ese apodo no es válido',
    hint: 'Debe tener entre 1 y 16 caracteres.',
  },
  INVALID_CHAT: {
    title: 'No se pudo enviar el mensaje',
    hint: 'Un mensaje debe tener entre 1 y 200 caracteres.',
  },
  NO_OPPONENT: {
    title: 'Todavía no hay nadie con quien hablar',
    hint: 'Podrás escribir en cuanto tu rival se una a la partida.',
  },
  NOT_YOUR_TURN: {
    title: 'No es tu turno',
    hint: 'Espera la jugada de tu rival.',
  },
  GAME_NOT_STARTED: {
    title: 'La partida aún no empieza',
    hint: 'Falta que tu rival se una con el token.',
  },
  INVALID_REASON: {
    title: 'El servidor rechazó el final de la partida',
    hint: 'Solo el jaque mate y las tablas se informan desde el tablero.',
  },
  DISCONNECTED: {
    title: 'Se perdió la conexión con el servidor',
    hint: 'Se reintenta sola. Si no vuelve, revisa la dirección del servidor más abajo.',
  },
}

export default function ErrorBanner({ error, onDismiss }) {
  const known = RECOVERY[error.code]

  return (
    <div className="strip strip--danger" role="alert">
      <span className="strip__dot" aria-hidden="true" />

      <span className="strip__text">
        <strong className="strip__title">{known ? known.title : error.message}</strong>
        {known && <span className="strip__hint">{known.hint}</span>}
      </span>

      <code className="strip__code">{error.code}</code>

      <button
        type="button"
        className="btn btn-icon strip__dismiss"
        aria-label="Descartar el aviso"
        onClick={onDismiss}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  )
}

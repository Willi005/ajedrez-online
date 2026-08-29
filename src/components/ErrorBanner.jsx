/**
 * Turns a server error into something the player can act on.
 *
 * Section 4.3 of the bitácora promises the `code` is stable while the `message`
 * is free text, so the code is what gets matched here. Anything unmapped falls
 * back to the server's own wording rather than to a generic apology: an
 * unexpected code is exactly when the real text is worth reading.
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
  DISCONNECTED: {
    title: 'Se perdió la conexión con el servidor',
    hint: 'Se reintenta sola. Si no vuelve, revisa la dirección del servidor más abajo.',
  },
}

export default function ErrorBanner({ error, onDismiss }) {
  const known = RECOVERY[error.code]

  return (
    <div className="banner" role="alert">
      <div className="banner__body">
        <p className="banner__title">{known ? known.title : error.message}</p>
        {known && <p className="banner__hint">{known.hint}</p>}
        <p className="banner__code">
          Código: <code>{error.code}</code>
        </p>
      </div>
      <button
        type="button"
        className="banner__dismiss"
        aria-label="Descartar el aviso"
        onClick={onDismiss}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path
            d="M5 5l10 10M15 5L5 15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}

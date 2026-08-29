import { useState } from 'react'
import { ENV_SERVER_URL, isValidServerUrl, normalizeServerUrl } from '../lib/config.js'
import { CONNECTION_STATUS } from '../hooks/useGameSocket.js'

const STATUS_LABELS = {
  [CONNECTION_STATUS.IDLE]: 'Sin conexión',
  [CONNECTION_STATUS.CONNECTING]: 'Conectando…',
  [CONNECTION_STATUS.OPEN]: 'Conectado',
  [CONNECTION_STATUS.CLOSED]: 'Desconectado',
}

/** The connection, as one of the design system's tags. */
const STATUS_TONES = {
  [CONNECTION_STATUS.OPEN]: 'tag-accent',
  [CONNECTION_STATUS.CONNECTING]: 'tag-outline',
  [CONNECTION_STATUS.CLOSED]: 'tag-danger',
  [CONNECTION_STATUS.IDLE]: 'tag-danger',
}

/**
 * Lets the player retarget the server without rebuilding.
 *
 * This is the demo's fallback plan: if the classroom network isolates the
 * machines, both players point the client at 127.0.0.1 and run the server
 * locally. It sits in the page footer, below everything, because it is
 * plumbing and not part of the game.
 */
export default function ServerSettings({ serverUrl, status, attempt, onChange, onReset }) {
  const [draft, setDraft] = useState(serverUrl)
  const [syncedUrl, setSyncedUrl] = useState(serverUrl)

  // Follow the effective URL when it changes elsewhere, such as after a reset.
  if (syncedUrl !== serverUrl) {
    setSyncedUrl(serverUrl)
    setDraft(serverUrl)
  }

  const normalized = normalizeServerUrl(draft)
  const canApply = isValidServerUrl(normalized) && normalized !== serverUrl
  const isOverridden = serverUrl !== ENV_SERVER_URL

  function handleSubmit(event) {
    event.preventDefault()
    if (!canApply) return
    onChange(normalized)
  }

  return (
    <details className="server-settings">
      <summary className="server-settings__summary">
        <span className="text-muted">Servidor</span>
        <code className="server-settings__url">{serverUrl}</code>
        <span className={`tag ${STATUS_TONES[status]}`}>
          {STATUS_LABELS[status]}
          {status === CONNECTION_STATUS.CONNECTING && attempt > 0
            ? ` · intento ${attempt + 1}`
            : ''}
        </span>
      </summary>

      <form className="server-settings__form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="server-url">Dirección del servidor</label>
          <input
            className="input"
            id="server-url"
            type="text"
            value={draft}
            autoComplete="off"
            spellCheck="false"
            placeholder="ws://127.0.0.1:8765"
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>

        <div className="server-settings__actions">
          <button type="submit" className="btn btn-primary" disabled={!canApply}>
            Aplicar y reconectar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onReset}
            disabled={!isOverridden}
          >
            Volver a la predeterminada
          </button>
        </div>

        <p className="card-body text-muted">
          Predeterminada de la compilación: <code>{ENV_SERVER_URL}</code>. Cambiar
          la dirección reinicia la conexión y te devuelve al inicio.
        </p>
      </form>
    </details>
  )
}

import { useState } from 'react'
import { ENV_SERVER_URL, isValidServerUrl, normalizeServerUrl } from '../lib/config.js'
import { CONNECTION_STATUS } from '../hooks/useGameSocket.js'

const STATUS_LABELS = {
  [CONNECTION_STATUS.IDLE]: 'Sin conexión',
  [CONNECTION_STATUS.CONNECTING]: 'Conectando…',
  [CONNECTION_STATUS.OPEN]: 'Conectado',
  [CONNECTION_STATUS.CLOSED]: 'Desconectado',
}

/**
 * Lets the player retarget the server without rebuilding.
 *
 * This is the demo's fallback plan: if the classroom network isolates the
 * machines, both players point the client at 127.0.0.1 and run the server
 * locally.
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
      <summary>
        Servidor: <code>{serverUrl}</code>{' '}
        <span className={`status status--${status}`}>
          {STATUS_LABELS[status]}
          {status === CONNECTION_STATUS.CONNECTING && attempt > 0
            ? ` (intento ${attempt + 1})`
            : ''}
        </span>
      </summary>

      <form onSubmit={handleSubmit}>
        <label htmlFor="server-url">Dirección del servidor</label>
        <input
          id="server-url"
          type="text"
          value={draft}
          autoComplete="off"
          spellCheck="false"
          placeholder="ws://127.0.0.1:8765"
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="row">
          <button type="submit" disabled={!canApply}>
            Aplicar y reconectar
          </button>
          <button type="button" onClick={onReset} disabled={!isOverridden}>
            Volver a la predeterminada
          </button>
        </div>
        <p className="hint">
          Predeterminada de la compilación: <code>{ENV_SERVER_URL}</code>. Cambiar
          la dirección reinicia la conexión y te devuelve al inicio.
        </p>
      </form>
    </details>
  )
}

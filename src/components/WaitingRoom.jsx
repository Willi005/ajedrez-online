import { useState } from 'react'

/**
 * Shown to the creator between `created` and `start`: the token is on screen so
 * it can be read aloud or copied to the opponent.
 */
export default function WaitingRoom({ token, onCancel }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied; the token is on screen either way.
    }
  }

  return (
    <section className="card">
      <h2>Esperando a tu rival</h2>
      <p className="hint">Pásale este token para que se una:</p>
      <p className="token-display">{token}</p>
      <div className="row">
        <button type="button" className="button--primary" onClick={handleCopy}>
          {copied ? 'Copiado' : 'Copiar token'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </section>
  )
}

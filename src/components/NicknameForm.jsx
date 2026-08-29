import { useState } from 'react'
import { MAX_NICKNAME_LENGTH, isValidNickname, normalizeNickname } from '../lib/protocol.js'

/**
 * First screen: asks for a nickname, which the caller persists in localStorage
 * so it is only ever asked once per browser.
 */
export default function NicknameForm({ initialValue = '', onSubmit }) {
  const [value, setValue] = useState(initialValue)

  const canSubmit = isValidNickname(value)

  function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit(normalizeNickname(value))
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>¿Cómo te llamas?</h2>
      <p className="hint">
        Tu apodo se guarda en este navegador. Podrás cambiarlo más adelante.
      </p>
      <label htmlFor="nickname">Apodo</label>
      <input
        id="nickname"
        type="text"
        value={value}
        maxLength={MAX_NICKNAME_LENGTH}
        autoComplete="off"
        autoFocus
        placeholder="hasta 16 caracteres"
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className="button--primary" disabled={!canSubmit}>
        Continuar
      </button>
    </form>
  )
}

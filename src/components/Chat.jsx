import { useEffect, useRef, useState } from 'react'
import { MAX_CHAT_LENGTH, isValidChatText, normalizeChatText } from '../lib/protocol.js'

/** How close to the bottom still counts as "reading the latest", in pixels. */
const STICKY_THRESHOLD_PX = 48

/** The three the maquette puts under the composer. */
const QUICK_PHRASES = ['¡Buena!', 'Suerte', 'Un momento']

/**
 * The right column of the Partida artboard.
 *
 * Purely presentational: the history is owned by App, which is also where the
 * `chat` messages arrive. Note that the server never echoes a message back to
 * its sender, so the sender's own line is appended by the caller on send.
 */
export default function Chat({ messages, canSend, onSend }) {
  const [draft, setDraft] = useState('')
  const listRef = useRef(null)
  // Whether the player was reading the newest lines before this render.
  const wasAtBottomRef = useRef(true)

  const normalized = normalizeChatText(draft)
  const remaining = MAX_CHAT_LENGTH - normalized.length
  const canSubmit = canSend && isValidChatText(draft)

  // Follow new messages, but only for a player who is already at the bottom:
  // yanking the view down while they scroll back through the history would be
  // worse than letting them miss a line they can still scroll to.
  useEffect(() => {
    const list = listRef.current
    if (list && wasAtBottomRef.current) {
      list.scrollTop = list.scrollHeight
    }
  }, [messages])

  function handleScroll() {
    const list = listRef.current
    if (!list) return
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight
    wasAtBottomRef.current = distance <= STICKY_THRESHOLD_PX
  }

  function send(text) {
    wasAtBottomRef.current = true
    onSend(text)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return
    send(normalized)
    setDraft('')
  }

  return (
    <section className="panel panel--chat" aria-label="Chat de la partida">
      <div className="panel__head">
        <h5 className="panel__title">Chat</h5>
        <span className="panel__count text-muted">solo esta sala</span>
      </div>

      <ol
        className="chat__log"
        ref={listRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && (
          <li className="chat__note text-muted">Todavía no hay mensajes.</li>
        )}

        {messages.map((message) =>
          message.kind === 'system' ? (
            <li key={message.id} className="chat__note text-muted">
              {message.text}
              {message.time && ` · ${message.time}`}
            </li>
          ) : (
            <li key={message.id} className={`chat__row chat__row--${message.kind}`}>
              <div className="chat__bubble">
                <span className="chat__author">{message.author}</span>
                <span className="chat__text">{message.text}</span>
              </div>
            </li>
          ),
        )}
      </ol>

      <form className="chat__composer" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="chat-input">
          Mensaje para tu rival
        </label>
        <input
          className="input"
          id="chat-input"
          type="text"
          value={draft}
          maxLength={MAX_CHAT_LENGTH}
          autoComplete="off"
          placeholder={canSend ? 'Escribe algo…' : 'Chat no disponible'}
          disabled={!canSend}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          Enviar
        </button>
      </form>

      <div className="chat__quick">
        {QUICK_PHRASES.map((phrase) => (
          <button
            key={phrase}
            type="button"
            className="btn btn-secondary chat__phrase"
            disabled={!canSend}
            onClick={() => send(phrase)}
          >
            {phrase}
          </button>
        ))}
      </div>

      {/* Only worth showing once the limit is actually in sight. */}
      {remaining <= 40 && (
        <p className="chat__counter text-muted tnum" role="status" aria-atomic="true">
          Quedan {remaining} caracteres.
        </p>
      )}
    </section>
  )
}

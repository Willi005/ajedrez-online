import { useEffect, useRef, useState } from 'react'
import { MAX_CHAT_LENGTH, isValidChatText, normalizeChatText } from '../lib/protocol.js'

/** How close to the bottom still counts as "reading the latest", in pixels. */
const STICKY_THRESHOLD_PX = 48

/**
 * The in-game chat.
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

  function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return
    wasAtBottomRef.current = true
    onSend(normalized)
    setDraft('')
  }

  return (
    <section className="chat" aria-label="Chat de la partida">
      <h2 className="section__title">Chat</h2>

      <ol
        className="chat__log"
        ref={listRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && (
          <li className="chat__empty">Todavía no hay mensajes.</li>
        )}
        {messages.map((message) => (
          <li key={message.id} className={`chat__line chat__line--${message.kind}`}>
            {message.kind === 'system' ? (
              <span className="chat__system">{message.text}</span>
            ) : (
              <>
                <span className="chat__author">{message.author}</span>
                <span className="chat__text">{message.text}</span>
              </>
            )}
          </li>
        ))}
      </ol>

      <form className="chat__composer" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="chat-input">
          Mensaje para tu rival
        </label>
        <input
          id="chat-input"
          type="text"
          value={draft}
          maxLength={MAX_CHAT_LENGTH}
          autoComplete="off"
          placeholder={canSend ? 'Escribe un mensaje…' : 'Chat no disponible'}
          disabled={!canSend}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="button--primary" disabled={!canSubmit}>
          Enviar
        </button>
      </form>

      {/* Only worth showing once the limit is actually in sight. */}
      {remaining <= 40 && (
        <p className="chat__counter" role="status" aria-atomic="true">
          Quedan {remaining} caracteres.
        </p>
      )}
    </section>
  )
}

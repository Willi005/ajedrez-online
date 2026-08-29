/**
 * The client half of the message contract documented in section 4 of
 * docs/bitacora-desarrollo.md.
 *
 * Every message the client sends is built here, so the wire format lives in one
 * file and stays checkable against the server's validator in server/protocol.py.
 */

/** Token alphabet without I, L, O, 0 and 1, so tokens stay unambiguous aloud. */
export const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const TOKEN_LENGTH = 5
export const MAX_NICKNAME_LENGTH = 16
export const MAX_CHAT_LENGTH = 200

const TOKEN_PATTERN = new RegExp(`^[${TOKEN_ALPHABET}]{${TOKEN_LENGTH}}$`)

/** Server -> client message types, from section 4.2. */
export const SERVER_MESSAGE = {
  CREATED: 'created',
  START: 'start',
  MOVE: 'move',
  CHAT: 'chat',
  GAME_OVER: 'game_over',
  OPPONENT_LEFT: 'opponent_left',
  ERROR: 'error',
}

/**
 * The server normalises tokens to upper case and accepts them trimmed, so the
 * client mirrors that before deciding whether a token is worth sending.
 */
export function normalizeToken(token) {
  return token.trim().toUpperCase()
}

export function isValidToken(token) {
  return TOKEN_PATTERN.test(normalizeToken(token))
}

/**
 * The server strips control characters and trims before measuring, so a
 * nickname that passes here passes there too.
 */
export function normalizeNickname(nickname) {
  return Array.from(nickname)
    .filter((char) => char === ' ' || !/\p{C}/u.test(char))
    .join('')
    .trim()
}

export function isValidNickname(nickname) {
  const normalized = normalizeNickname(nickname)
  return normalized.length >= 1 && normalized.length <= MAX_NICKNAME_LENGTH
}

/**
 * Chat text is cleaned the same way, but the server *strips* control characters
 * from a chat line instead of rejecting it, so this never fails: it returns the
 * exact string the server would end up broadcasting. Sending the normalised
 * text is what keeps the sender's own echo identical to what the opponent sees.
 */
export function normalizeChatText(text) {
  return normalizeNickname(text)
}

export function isValidChatText(text) {
  const normalized = normalizeChatText(text)
  return normalized.length >= 1 && normalized.length <= MAX_CHAT_LENGTH
}

// -- outgoing messages ------------------------------------------------------

export function createMessage(nickname) {
  return { type: 'create', nickname: normalizeNickname(nickname) }
}

export function joinMessage(token, nickname) {
  return {
    type: 'join',
    token: normalizeToken(token),
    nickname: normalizeNickname(nickname),
  }
}

export function moveMessage({ from, to, promotion, fen }) {
  return { type: 'move', from, to, promotion: promotion ?? null, fen }
}

export function chatMessage(text) {
  return { type: 'chat', text: normalizeChatText(text) }
}

export function resignMessage() {
  return { type: 'resign' }
}

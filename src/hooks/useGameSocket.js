import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The single WebSocket connection to the chess server.
 *
 * The browser hides socket(), connect() and the RFC 6455 handshake behind
 * `new WebSocket(...)`; everything above that — the JSON message contract of
 * section 4 of the bitácora — is handled here.
 *
 * The connection is owned by the hook: it opens when the URL is set, reopens by
 * itself when it drops, and closes when the URL changes or the app unmounts.
 * Note that the server keeps no session across sockets, so a reconnection puts
 * the player back in the lobby rather than back in their room. `onOpen` is the
 * signal to reset game state.
 */

export const CONNECTION_STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  OPEN: 'open',
  CLOSED: 'closed',
}

const INITIAL_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 10000

function retryDelay(attempt) {
  return Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS)
}

export function useGameSocket({ url, onMessage, onOpen, onClose }) {
  const [status, setStatus] = useState(CONNECTION_STATUS.IDLE)
  const [attempt, setAttempt] = useState(0)

  const socketRef = useRef(null)
  const retryTimerRef = useRef(null)
  const attemptRef = useRef(0)
  // Set by the connection effect so `reconnect` can reach into its scope.
  const forceReconnectRef = useRef(null)

  // Handlers live in a ref so that a caller re-creating them on every render
  // never tears down and reopens the socket.
  const handlersRef = useRef({ onMessage, onOpen, onClose })
  useEffect(() => {
    handlersRef.current = { onMessage, onOpen, onClose }
  })

  useEffect(() => {
    if (!url) return undefined

    // Set while this effect tears itself down, so the close handler knows the
    // drop was deliberate and must not schedule a reconnection.
    let disposed = false

    function scheduleReconnect() {
      const delay = retryDelay(attemptRef.current)
      attemptRef.current += 1
      setAttempt(attemptRef.current)
      retryTimerRef.current = window.setTimeout(open, delay)
    }

    function open() {
      if (disposed) return

      setStatus(CONNECTION_STATUS.CONNECTING)

      let socket
      try {
        socket = new WebSocket(url)
      } catch {
        // A malformed URL throws synchronously; treat it as a failed attempt.
        setStatus(CONNECTION_STATUS.CLOSED)
        scheduleReconnect()
        return
      }
      socketRef.current = socket

      socket.onopen = () => {
        if (disposed) return
        attemptRef.current = 0
        setAttempt(0)
        setStatus(CONNECTION_STATUS.OPEN)
        handlersRef.current.onOpen?.()
      }

      socket.onmessage = (event) => {
        if (disposed) return
        let payload
        try {
          payload = JSON.parse(event.data)
        } catch {
          return // The server only ever sends JSON; anything else is noise.
        }
        if (payload && typeof payload === 'object') {
          handlersRef.current.onMessage?.(payload)
        }
      }

      socket.onclose = () => {
        if (disposed) return
        socketRef.current = null
        setStatus(CONNECTION_STATUS.CLOSED)
        handlersRef.current.onClose?.()
        scheduleReconnect()
      }

      // `onerror` always precedes `onclose`, so reconnection is handled there.
      socket.onerror = () => {}
    }

    forceReconnectRef.current = () => {
      window.clearTimeout(retryTimerRef.current)
      attemptRef.current = 0
      setAttempt(0)
      const socket = socketRef.current
      if (socket) {
        socket.close() // onclose schedules the reopen.
      } else {
        open()
      }
    }

    open()

    return () => {
      disposed = true
      forceReconnectRef.current = null
      window.clearTimeout(retryTimerRef.current)
      attemptRef.current = 0
      const socket = socketRef.current
      socketRef.current = null
      if (socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onclose = null
        socket.onerror = null
        socket.close()
      }
    }
  }, [url])

  /** Send one client message. Returns false when the socket is not open. */
  const send = useCallback((payload) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(payload))
    return true
  }, [])

  /**
   * Drop the current socket and open a fresh one.
   *
   * The protocol has no "leave room" message, so closing the socket is the only
   * way to get out of a room the player no longer wants to be in.
   */
  const reconnect = useCallback(() => {
    forceReconnectRef.current?.()
  }, [])

  const effectiveStatus = url ? status : CONNECTION_STATUS.IDLE

  return {
    status: effectiveStatus,
    isOpen: effectiveStatus === CONNECTION_STATUS.OPEN,
    attempt,
    send,
    reconnect,
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ErrorBanner from './components/ErrorBanner.jsx'
import GameOver from './components/GameOver.jsx'
import GameScreen from './components/GameScreen.jsx'
import Home from './components/Home.jsx'
import ServerSettings from './components/ServerSettings.jsx'
import WaitingRoom from './components/WaitingRoom.jsx'
import { useChessGame } from './hooks/useChessGame.js'
import { useGameSocket } from './hooks/useGameSocket.js'
import { ENV_SERVER_URL, resolveServerUrl } from './lib/config.js'
import {
  SERVER_MESSAGE,
  chatMessage,
  createMessage,
  gameEndMessage,
  joinMessage,
  moveMessage,
  resignMessage,
} from './lib/protocol.js'
import {
  clearServerUrl,
  readNickname,
  writeNickname,
  writeServerUrl,
} from './lib/storage.js'
import './App.css'

/**
 * Application shell: owns the session state (nickname, room, phase) and wires
 * the socket to the chess engine.
 *
 * Phases:
 *   lobby    — connected, not in a room
 *   waiting  — created a room, the token is out, no opponent yet
 *   playing  — both players seated
 *   finished — the game ended or the opponent disappeared
 */
const PHASE = {
  LOBBY: 'lobby',
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished',
}

/**
 * The end of the game as the position itself reports it, or null while there is
 * still something to play. `turn` is the side that has to move, so at mate it is
 * the side that lost.
 */
function boardOutcome({ isCheckmate, isDraw, turn }) {
  if (isCheckmate) return { reason: 'checkmate', winner: turn === 'w' ? 'black' : 'white' }
  if (isDraw) return { reason: 'draw', winner: null }
  return null
}

/** The time on a chat line, the way the maquette writes it. */
function stamp() {
  return new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

export default function App() {
  const [nickname, setNickname] = useState(readNickname)
  const [serverUrl, setServerUrl] = useState(resolveServerUrl)

  const [phase, setPhase] = useState(PHASE.LOBBY)
  const [room, setRoom] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const [outcomeSeen, setOutcomeSeen] = useState(false)
  const [lastError, setLastError] = useState(null)
  const [messages, setMessages] = useState([])

  // The last thing the server said about the two clocks, stamped with the
  // moment it arrived so the display can tick on from there. Null until a game
  // starts.
  const [clock, setClock] = useState(null)

  // Whether this browser has already told the server that its board reached an
  // ending. Both clients detect mate at the same instant and both report it;
  // this only stops one of them saying it twice.
  const reportedEnd = useRef(false)

  // Chat lines need a stable key and the server sends no id, so they are
  // numbered locally. A counter beats an index because the list only ever grows
  // at the end and a ref never triggers a render of its own.
  const nextMessageId = useRef(0)

  const game = useChessGame()
  const { reset: resetGame, applyOpponentMove } = game

  const pushMessage = useCallback((message) => {
    nextMessageId.current += 1
    setMessages((current) => [
      ...current,
      { id: nextMessageId.current, time: stamp(), ...message },
    ])
  }, [])

  const returnToLobby = useCallback(() => {
    setPhase(PHASE.LOBBY)
    setRoom(null)
    setOutcome(null)
    setOutcomeSeen(false)
    setMessages([])
    setClock(null)
    reportedEnd.current = false
    resetGame()
  }, [resetGame])

  const handleMessage = useCallback(
    (message) => {
      switch (message.type) {
        case SERVER_MESSAGE.CREATED:
          resetGame()
          setOutcome(null)
          setOutcomeSeen(false)
          setMessages([])
          setClock(null)
          reportedEnd.current = false
          setRoom({
            token: message.token,
            color: message.color,
            nickname,
            opponent: null,
          })
          setPhase(PHASE.WAITING)
          break

        case SERVER_MESSAGE.START:
          resetGame()
          setOutcome(null)
          setOutcomeSeen(false)
          setMessages([])
          setClock(null)
          reportedEnd.current = false
          setRoom({
            token: message.token,
            color: message.color,
            nickname: message.nickname,
            opponent: message.opponent,
          })
          setPhase(PHASE.PLAYING)
          pushMessage({
            kind: 'system',
            text: `La partida comenzó contra ${message.opponent}`,
          })
          break

        case SERVER_MESSAGE.MOVE:
          applyOpponentMove(message)
          break

        case SERVER_MESSAGE.CHAT:
          pushMessage({ kind: 'opponent', author: message.from, text: message.text })
          break

        case SERVER_MESSAGE.CLOCK:
          setClock({
            white: message.white,
            black: message.black,
            turn: message.turn,
            running: message.running,
            at: performance.now(),
          })
          break

        case SERVER_MESSAGE.GAME_OVER:
          setOutcome({ reason: message.reason, winner: message.winner })
          setPhase(PHASE.FINISHED)
          break

        case SERVER_MESSAGE.OPPONENT_LEFT:
          setOutcome({ reason: 'opponent_left', winner: null })
          setPhase(PHASE.FINISHED)
          pushMessage({ kind: 'system', text: 'Tu rival dejó la partida' })
          break

        case SERVER_MESSAGE.ERROR:
          setLastError({ code: message.code, message: message.message })
          break

        default:
          break
      }
    },
    [applyOpponentMove, nickname, pushMessage, resetGame],
  )

  // The server destroys the room as soon as the socket goes away and keeps no
  // state across connections, so losing or replacing the socket means the room
  // is gone. Both ends of that transition put the player back in the lobby
  // rather than leave a dead board on screen.
  const handleOpen = useCallback(() => {
    setLastError(null)
    returnToLobby()
  }, [returnToLobby])

  const { status, isOpen, attempt, send, reconnect } = useGameSocket({
    url: serverUrl,
    onMessage: handleMessage,
    onOpen: handleOpen,
    onClose: returnToLobby,
  })

  // Checkmate and stalemate end the game without anyone sending anything: the
  // protocol has no message for them, and it does not need one. Both clients
  // hold the same position and chess.js reaches the same verdict on each, so
  // the end is detected twice in parallel instead of being announced.
  //
  // It is read straight off the board rather than copied into state: the
  // position already says the game is over, and a second copy of that fact
  // could only ever disagree with it.
  //
  // Memoised on the snapshot rather than recomputed loose, so its identity only
  // changes when the position does — which is what lets the effect below depend
  // on it and fire once per ending instead of once per render.
  const localOutcome = useMemo(() => boardOutcome(game.state), [game.state])

  // The server's word — a resignation, a rival who vanished — and the board's
  // own verdict. Only one of the two can happen: the board freezes at mate, and
  // a `game_over` locks it before anything else can be played.
  //
  // The board's own verdict comes first. With a clock running the two can now
  // disagree: after mate nobody moves, and if the server had not been told it
  // would go on charging the mated player and eventually declare them lost on
  // time. It *is* told — see the effect below — but a `game_over` already in
  // flight when that word arrives must not overwrite the real result.
  const effectiveOutcome = localOutcome ?? outcome

  // Tell the server that the position ended. Only checkmate and stalemate go
  // through here: resigning, leaving and running out of time are all things the
  // server sees for itself.
  useEffect(() => {
    if (!localOutcome || reportedEnd.current) return
    reportedEnd.current = true
    send(gameEndMessage(localOutcome.reason, localOutcome.winner))
  }, [localOutcome, send])

  // -- actions --------------------------------------------------------------

  function rememberNickname(value) {
    setNickname(value)
    writeNickname(value)
  }

  function handleCreate(player) {
    setLastError(null)
    rememberNickname(player)
    send(createMessage(player))
  }

  function handleJoin(player, token) {
    setLastError(null)
    rememberNickname(player)
    send(joinMessage(token, player))
  }

  function reportDisconnected(detail) {
    setLastError({ code: 'DISCONNECTED', message: detail })
  }

  function handleMove({ from, to, promotion }) {
    setLastError(null)

    const played = game.makeMove({ from, to, promotion })
    if (!played) return // chess.js rejected it; nothing left the client.

    if (!send(moveMessage(played))) {
      // The move never reached the server, so undo it rather than let the two
      // boards drift apart.
      game.undoLastMove()
      reportDisconnected('La jugada no se envió.')
    }
  }

  function handleChatSend(text) {
    setLastError(null)

    // The server relays a chat line to the opponent only; it never echoes it
    // back to whoever sent it, so the sender's own copy is added here.
    if (!send(chatMessage(text))) {
      reportDisconnected('El mensaje no se envió.')
      return
    }
    pushMessage({ kind: 'self', author: nickname, text })
  }

  function handleResign() {
    setLastError(null)
    // The server answers `game_over` to both players, so the outcome is not set
    // here: it arrives the same way it arrives for the winner.
    if (!send(resignMessage())) {
      reportDisconnected('No se pudo abandonar la partida.')
    }
  }

  function handleServerUrlChange(url) {
    writeServerUrl(url)
    setServerUrl(url)
    returnToLobby()
  }

  function handleServerUrlReset() {
    clearServerUrl()
    setServerUrl(ENV_SERVER_URL)
    returnToLobby()
  }

  // -- rendering ------------------------------------------------------------

  const inRoom = (phase === PHASE.PLAYING || phase === PHASE.FINISHED) && room

  function statusText() {
    if (effectiveOutcome) return 'Partida terminada'
    if (!isOpen) return 'Sin conexión'
    const myColor = room.color === 'white' ? 'w' : 'b'
    return game.state.turn === myColor
      ? 'Tu turno'
      : `Juega ${room.opponent}`
  }

  function renderContent() {
    if (phase === PHASE.WAITING && room) {
      return <WaitingRoom token={room.token} onCancel={reconnect} />
    }

    if (inRoom) {
      // Chatting still works after a resignation — both players are in the room
      // until one of them leaves — but not once the opponent's socket is gone,
      // which is when the server would answer NO_OPPONENT.
      const canChat = isOpen && effectiveOutcome?.reason !== 'opponent_left'

      // The reading the seats tick from. Freezing it here the instant the board
      // says the game is over means the figures stop with the game rather than
      // running on for the round trip it takes the server to agree.
      const shownClock =
        clock && effectiveOutcome ? { ...clock, running: false } : clock

      return (
        <GameScreen
          game={game}
          room={room}
          clock={shownClock}
          isGameActive={phase === PHASE.PLAYING && isOpen && !effectiveOutcome}
          statusText={statusText()}
          chat={{ messages, canSend: canChat, onSend: handleChatSend }}
          onMove={handleMove}
          onResign={handleResign}
        />
      )
    }

    return (
      <Home
        nickname={nickname}
        canAct={isOpen}
        onCreate={handleCreate}
        onJoin={handleJoin}
      />
    )
  }

  return (
    <div className={`app${inRoom ? ' app--match' : ''}`}>
      {lastError && (
        <ErrorBanner error={lastError} onDismiss={() => setLastError(null)} />
      )}

      <main className="app__content">{renderContent()}</main>

      <footer className="app__footer">
        <ServerSettings
          serverUrl={serverUrl}
          status={status}
          attempt={attempt}
          onChange={handleServerUrlChange}
          onReset={handleServerUrlReset}
        />
      </footer>

      {inRoom && effectiveOutcome && !outcomeSeen && (
        <GameOver
          outcome={effectiveOutcome}
          myColor={room.color}
          moveCount={Math.ceil(game.state.history.length / 2)}
          token={room.token}
          getPgn={game.getPgn}
          onReturn={reconnect}
          onDismiss={() => setOutcomeSeen(true)}
        />
      )}
    </div>
  )
}

import { useCallback, useState } from 'react'
import GameScreen from './components/GameScreen.jsx'
import Lobby from './components/Lobby.jsx'
import NicknameForm from './components/NicknameForm.jsx'
import ServerSettings from './components/ServerSettings.jsx'
import WaitingRoom from './components/WaitingRoom.jsx'
import { useChessGame } from './hooks/useChessGame.js'
import { useGameSocket } from './hooks/useGameSocket.js'
import { ENV_SERVER_URL, resolveServerUrl } from './lib/config.js'
import {
  SERVER_MESSAGE,
  createMessage,
  joinMessage,
  moveMessage,
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

export default function App() {
  const [nickname, setNickname] = useState(readNickname)
  const [editingNickname, setEditingNickname] = useState(false)
  const [serverUrl, setServerUrl] = useState(resolveServerUrl)

  const [phase, setPhase] = useState(PHASE.LOBBY)
  const [room, setRoom] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const [lastError, setLastError] = useState(null)

  const game = useChessGame()
  const { reset: resetGame, applyOpponentMove } = game

  const returnToLobby = useCallback(() => {
    setPhase(PHASE.LOBBY)
    setRoom(null)
    setOutcome(null)
    resetGame()
  }, [resetGame])

  const handleMessage = useCallback(
    (message) => {
      switch (message.type) {
        case SERVER_MESSAGE.CREATED:
          resetGame()
          setOutcome(null)
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
          setRoom({
            token: message.token,
            color: message.color,
            nickname: message.nickname,
            opponent: message.opponent,
          })
          setPhase(PHASE.PLAYING)
          break

        case SERVER_MESSAGE.MOVE:
          applyOpponentMove(message)
          break

        case SERVER_MESSAGE.GAME_OVER:
          setOutcome({ reason: message.reason, winner: message.winner })
          setPhase(PHASE.FINISHED)
          break

        case SERVER_MESSAGE.OPPONENT_LEFT:
          setOutcome({ reason: 'opponent_left', winner: null })
          setPhase(PHASE.FINISHED)
          break

        case SERVER_MESSAGE.ERROR:
          setLastError({ code: message.code, message: message.message })
          break

        // `chat` is deliberately ignored: it belongs to block 3.
        default:
          break
      }
    },
    [applyOpponentMove, nickname, resetGame],
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

  // -- actions --------------------------------------------------------------

  function handleNicknameSubmit(value) {
    setNickname(value)
    writeNickname(value)
    setEditingNickname(false)
  }

  function handleCreate() {
    setLastError(null)
    send(createMessage(nickname))
  }

  function handleJoin(token) {
    setLastError(null)
    send(joinMessage(token, nickname))
  }

  function handleMove({ from, to, promotion }) {
    setLastError(null)

    const played = game.makeMove({ from, to, promotion })
    if (!played) return // chess.js rejected it; nothing left the client.

    if (!send(moveMessage(played))) {
      // The move never reached the server, so undo it rather than let the two
      // boards drift apart.
      game.undoLastMove()
      setLastError({
        code: 'DISCONNECTED',
        message: 'No hay conexión con el servidor. La jugada no se envió.',
      })
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

  function renderContent() {
    if (!nickname || editingNickname) {
      return <NicknameForm initialValue={nickname} onSubmit={handleNicknameSubmit} />
    }

    if (phase === PHASE.WAITING && room) {
      return <WaitingRoom token={room.token} onCancel={reconnect} />
    }

    if ((phase === PHASE.PLAYING || phase === PHASE.FINISHED) && room) {
      return (
        <>
          <GameScreen
            game={game}
            room={room}
            isGameActive={phase === PHASE.PLAYING && isOpen}
            onMove={handleMove}
          />
          {/* Block 3 replaces this with a proper end-of-game screen. */}
          {outcome && (
            <div className="panel">
              <p>
                {outcome.reason === 'opponent_left'
                  ? 'Tu rival abandonó la partida.'
                  : `Partida terminada (${outcome.reason}). Ganan las ${
                      outcome.winner === 'white' ? 'blancas' : 'negras'
                    }.`}
              </p>
              <button type="button" onClick={reconnect}>
                Volver al inicio
              </button>
            </div>
          )}
        </>
      )
    }

    return (
      <Lobby
        nickname={nickname}
        canAct={isOpen}
        onCreate={handleCreate}
        onJoin={handleJoin}
        onChangeNickname={() => setEditingNickname(true)}
      />
    )
  }

  return (
    <main className="app">
      <h1>Ajedrez en línea</h1>

      {renderContent()}

      {/* Placeholder feedback; the error UI is block 3's job. */}
      {lastError && (
        <p className="error" role="alert">
          {lastError.message} <code>({lastError.code})</code>
        </p>
      )}

      <ServerSettings
        serverUrl={serverUrl}
        status={status}
        attempt={attempt}
        onChange={handleServerUrlChange}
        onReset={handleServerUrlReset}
      />
    </main>
  )
}

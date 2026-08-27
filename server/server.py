"""TCP socket server for ajedrez-online.

Architecture: the main thread blocks on accept() and hands every accepted
connection to its own worker thread. Shared state lives in a single RoomRegistry
guarded by a lock, so no game state is ever touched by two threads at once.

The server speaks WebSocket because that is the only socket a browser can open,
but the protocol is implemented by hand on top of a plain SOCK_STREAM socket.
"""

import json
import logging
import socket
import threading

from server.protocol import ValidationError, validate_client_message
from server.rooms import RoomError, RoomRegistry
from server.websocket import (
    CLOSE_MESSAGE_TOO_BIG,
    CLOSE_NORMAL,
    CLOSE_PROTOCOL_ERROR,
    MAX_PAYLOAD_BYTES,
    OPCODE_CLOSE,
    OPCODE_PING,
    OPCODE_TEXT,
    HandshakeError,
    ProtocolError,
    build_handshake_response,
    encode_close_frame,
    encode_pong_frame,
    encode_text_frame,
)

DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8765
LISTEN_BACKLOG = 16
RECV_CHUNK = 4096
HANDSHAKE_TIMEOUT = 10.0
CLIENT_TIMEOUT = 300.0

logger = logging.getLogger("ajedrez")


class ChessServer:
    def __init__(self, host=DEFAULT_HOST, port=DEFAULT_PORT):
        self.host = host
        self.requested_port = port
        self.port = None
        self._socket = None
        self._running = False
        self._rooms = RoomRegistry()
        # Guards writes to a client socket: two threads can relay to the same
        # peer, and interleaved sendall() calls would corrupt the frame stream.
        self._send_locks = {}
        self._send_locks_guard = threading.Lock()

    # -- lifecycle ---------------------------------------------------------

    def bind(self):
        """Create the listening socket: socket() -> setsockopt() -> bind() -> listen()."""
        self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

        # Without SO_REUSEADDR a restart fails while the previous socket sits in
        # TIME_WAIT, which is exactly what happens when demoing repeatedly.
        self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        self._socket.bind((self.host, self.requested_port))
        self._socket.listen(LISTEN_BACKLOG)

        # A port of 0 means "any free port"; getsockname() reports what we got.
        self.port = self._socket.getsockname()[1]

        # Without a timeout, accept() would block forever and stop() could never
        # interrupt it.
        self._socket.settimeout(0.5)
        return self.port

    def serve_forever(self):
        """Accept connections until stop() is called, one thread per client."""
        if self._socket is None:
            self.bind()

        self._running = True
        logger.info("Servidor escuchando en %s:%s", self.host, self.port)

        while self._running:
            try:
                connection, address = self._socket.accept()
            except socket.timeout:
                continue
            except OSError:
                break

            logger.info("Conexión aceptada desde %s:%s", address[0], address[1])
            worker = threading.Thread(
                target=self._handle_client,
                args=(connection, address),
                daemon=True,
            )
            worker.start()

        logger.info("Servidor detenido.")

    def stop(self):
        self._running = False
        if self._socket is not None:
            try:
                self._socket.close()
            except OSError:
                pass
            self._socket = None

    # -- per-client handling -----------------------------------------------

    def _handle_client(self, connection, address):
        peer = f"{address[0]}:{address[1]}"
        try:
            connection.settimeout(HANDSHAKE_TIMEOUT)
            if not self._handshake(connection, peer):
                return

            connection.settimeout(CLIENT_TIMEOUT)
            self._read_loop(connection, peer)
        except (ConnectionResetError, BrokenPipeError):
            logger.info("[%s] conexión perdida", peer)
        except socket.timeout:
            logger.info("[%s] tiempo de espera agotado", peer)
        except Exception:  # noqa: BLE001 - a bad client must not kill the server
            logger.exception("[%s] error inesperado", peer)
        finally:
            self._cleanup(connection, peer)

    def _handshake(self, connection, peer):
        request = b""
        while b"\r\n\r\n" not in request:
            chunk = connection.recv(RECV_CHUNK)
            if not chunk:
                return False
            request += chunk
            if len(request) > RECV_CHUNK * 4:
                logger.warning("[%s] handshake demasiado grande", peer)
                return False

        try:
            response = build_handshake_response(request)
        except HandshakeError as error:
            logger.warning("[%s] handshake rechazado: %s", peer, error)
            connection.sendall(
                b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"
            )
            return False

        connection.sendall(response)
        logger.info("[%s] handshake WebSocket completado", peer)
        return True

    def _read_loop(self, connection, peer):
        from server.websocket import decode_frame

        buffer = b""
        while self._running:
            try:
                frame, buffer = decode_frame(buffer)
            except ProtocolError as error:
                logger.warning("[%s] trama inválida: %s", peer, error)
                self._send_raw(connection, encode_close_frame(CLOSE_PROTOCOL_ERROR))
                return

            if frame is None:
                chunk = connection.recv(RECV_CHUNK)
                if not chunk:
                    logger.info("[%s] cliente desconectado", peer)
                    return
                buffer += chunk

                if len(buffer) > MAX_PAYLOAD_BYTES * 2:
                    logger.warning("[%s] mensaje demasiado grande", peer)
                    self._send_raw(connection, encode_close_frame(CLOSE_MESSAGE_TOO_BIG))
                    return
                continue

            if frame.opcode == OPCODE_CLOSE:
                logger.info("[%s] cerró la conexión", peer)
                self._send_raw(connection, encode_close_frame(CLOSE_NORMAL))
                return
            if frame.opcode == OPCODE_PING:
                self._send_raw(connection, encode_pong_frame(frame.payload))
                continue
            if frame.opcode != OPCODE_TEXT:
                continue

            try:
                text = frame.payload.decode("utf-8")
            except UnicodeDecodeError:
                self._send_error(connection, "BAD_ENCODING", "El mensaje no es UTF-8.")
                continue

            self._dispatch(connection, peer, text)

    # -- message dispatch ---------------------------------------------------

    def _dispatch(self, connection, peer, text):
        try:
            message = validate_client_message(text)
        except ValidationError as error:
            logger.info("[%s] mensaje rechazado (%s)", peer, error.code)
            self._send_error(connection, error.code, error.message)
            return

        handlers = {
            "create": self._handle_create,
            "join": self._handle_join,
            "move": self._handle_move,
            "chat": self._handle_chat,
            "resign": self._handle_resign,
        }

        try:
            handlers[message["type"]](connection, peer, message)
        except RoomError as error:
            logger.info("[%s] operación rechazada (%s)", peer, error.code)
            self._send_error(connection, error.code, error.message)

    def _handle_create(self, connection, peer, message):
        token = self._rooms.create_room(connection, message["nickname"])
        logger.info("[%s] creó la sala %s como '%s'", peer, token, message["nickname"])
        self._send(connection, {"type": "created", "token": token, "color": "white"})

    def _handle_join(self, connection, peer, message):
        room = self._rooms.join_room(
            message["token"], connection, message["nickname"]
        )
        logger.info("[%s] se unió a la sala %s", peer, room.token)

        for player in (room.white, room.black):
            opponent = room.other_player(player.connection)
            self._send(
                player.connection,
                {
                    "type": "start",
                    "token": room.token,
                    "color": player.color,
                    "nickname": player.nickname,
                    "opponent": opponent.nickname,
                },
            )

    def _handle_move(self, connection, peer, message):
        room = self._rooms.record_move(connection)
        room.moves.append(message)
        opponent = room.other_player(connection)
        logger.info(
            "[%s] jugada %s->%s en la sala %s",
            peer,
            message["from"],
            message["to"],
            room.token,
        )
        self._send(opponent.connection, message)

    def _handle_chat(self, connection, peer, message):
        room = self._rooms.room_of(connection)
        if room is None:
            raise RoomError("NOT_IN_ROOM", "No estás en una partida.")

        sender = room.player_for(connection)
        opponent = room.other_player(connection)
        if opponent is None:
            raise RoomError("NO_OPPONENT", "Todavía no hay rival en la sala.")

        self._send(
            opponent.connection,
            {"type": "chat", "from": sender.nickname, "text": message["text"]},
        )

    def _handle_resign(self, connection, peer, message):
        room = self._rooms.room_of(connection)
        if room is None:
            raise RoomError("NOT_IN_ROOM", "No estás en una partida.")

        player = room.player_for(connection)
        winner = "black" if player.color == "white" else "white"
        logger.info("[%s] se rindió en la sala %s", peer, room.token)

        payload = {"type": "game_over", "reason": "resign", "winner": winner}
        for other in (room.white, room.black):
            if other is not None:
                self._send(other.connection, payload)
        room.status = "finished"

    # -- sending ------------------------------------------------------------

    def _send_lock_for(self, connection):
        with self._send_locks_guard:
            return self._send_locks.setdefault(connection, threading.Lock())

    def _send_raw(self, connection, data):
        """Serialise writes per connection so frames never interleave."""
        with self._send_lock_for(connection):
            try:
                connection.sendall(data)
            except OSError:
                pass

    def _send(self, connection, payload):
        self._send_raw(connection, encode_text_frame(json.dumps(payload)))

    def _send_error(self, connection, code, message):
        self._send(connection, {"type": "error", "code": code, "message": message})

    # -- teardown -----------------------------------------------------------

    def _cleanup(self, connection, peer):
        """Tell the opponent, drop the room entry, and release the socket."""
        room = self._rooms.leave(connection)
        if room is not None:
            opponent = room.other_player(connection)
            if opponent is not None:
                self._send(opponent.connection, {"type": "opponent_left"})

        with self._send_locks_guard:
            self._send_locks.pop(connection, None)

        try:
            connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        finally:
            connection.close()
            logger.info("[%s] socket liberado", peer)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Servidor de ajedrez online (TCP).")
    parser.add_argument("--host", default=DEFAULT_HOST, help="IP a la que asociarse")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Puerto TCP")
    parser.add_argument("--verbose", action="store_true", help="Registro detallado")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s  %(levelname)-7s  %(message)s",
        datefmt="%H:%M:%S",
    )

    server = ChessServer(host=args.host, port=args.port)
    server.bind()
    print(f"Servidor de ajedrez escuchando en {args.host}:{server.port}")
    print("Ctrl+C para detener.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDeteniendo el servidor...")
    finally:
        server.stop()


if __name__ == "__main__":
    main()

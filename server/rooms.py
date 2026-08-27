"""Token-based game rooms shared by every client thread.

One thread serves each connected client, so all access to the room table goes
through a single reentrant lock. Every public method here is safe to call from
any thread.
"""

import secrets
import threading

from server.protocol import TOKEN_ALPHABET, TOKEN_LENGTH

# Give up rather than spin forever if the token space is somehow exhausted.
MAX_TOKEN_ATTEMPTS = 100


class RoomError(Exception):
    """Raised when a room operation is not allowed in the current state."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


class Player:
    def __init__(self, connection, nickname, color):
        self.connection = connection
        self.nickname = nickname
        self.color = color


class Room:
    def __init__(self, token, white):
        self.token = token
        self.white = white
        self.black = None
        self.turn = "white"
        self.status = "waiting"
        self.moves = []

    def player_for(self, connection):
        for player in (self.white, self.black):
            if player is not None and player.connection is connection:
                return player
        return None

    def other_player(self, connection):
        for player in (self.white, self.black):
            if player is not None and player.connection is not connection:
                return player
        return None


def _default_token_factory():
    return "".join(secrets.choice(TOKEN_ALPHABET) for _ in range(TOKEN_LENGTH))


class RoomRegistry:
    """In-memory table of active rooms. Nothing is persisted between runs."""

    def __init__(self, token_factory=_default_token_factory):
        self._token_factory = token_factory
        self._rooms = {}
        self._room_by_connection = {}
        self._lock = threading.RLock()

    def create_room(self, connection, nickname):
        """Open a new room with `connection` playing white. Returns its token."""
        with self._lock:
            if connection in self._room_by_connection:
                raise RoomError("ALREADY_IN_ROOM", "Ya estás en una partida.")

            token = self._allocate_token()
            room = Room(token, Player(connection, nickname, "white"))
            self._rooms[token] = room
            self._room_by_connection[connection] = room
            return token

    def _allocate_token(self):
        """Draw an unused token. Caller must already hold the lock."""
        for _ in range(MAX_TOKEN_ATTEMPTS):
            token = self._token_factory()
            if token not in self._rooms:
                return token
        raise RoomError("NO_TOKEN_AVAILABLE", "No hay tokens disponibles.")

    def join_room(self, token, connection, nickname):
        """Seat `connection` as black in an existing room and start the game."""
        with self._lock:
            if connection in self._room_by_connection:
                raise RoomError("ALREADY_IN_ROOM", "Ya estás en una partida.")

            room = self._rooms.get(token)
            if room is None:
                raise RoomError("ROOM_NOT_FOUND", "La sala no existe.")
            if room.black is not None:
                raise RoomError("ROOM_FULL", "La sala ya tiene dos jugadores.")

            room.black = Player(connection, nickname, "black")
            room.status = "playing"
            self._room_by_connection[connection] = room
            return room

    def get_room(self, token):
        with self._lock:
            return self._rooms.get(token)

    def room_of(self, connection):
        with self._lock:
            return self._room_by_connection.get(connection)

    def opponent_of(self, connection):
        """Return the other player's connection, or None if nobody joined yet."""
        with self._lock:
            room = self._room_by_connection.get(connection)
            if room is None:
                return None
            opponent = room.other_player(connection)
            return opponent.connection if opponent else None

    def record_move(self, connection):
        """Check that it is this player's turn, then hand the turn over."""
        with self._lock:
            room = self._room_by_connection.get(connection)
            if room is None:
                raise RoomError("NOT_IN_ROOM", "No estás en una partida.")
            if room.status != "playing":
                raise RoomError("GAME_NOT_STARTED", "La partida aún no comienza.")

            player = room.player_for(connection)
            if player.color != room.turn:
                raise RoomError("NOT_YOUR_TURN", "No es tu turno.")

            room.turn = "black" if room.turn == "white" else "white"
            return room

    def leave(self, connection):
        """Remove a player. Returns the room they left, or None if they had none."""
        with self._lock:
            room = self._room_by_connection.pop(connection, None)
            if room is None:
                return None

            room.status = "finished"
            player = room.player_for(connection)
            if player is not None:
                if room.white is player:
                    room.white = None
                else:
                    room.black = None

            if room.white is None and room.black is None:
                self._rooms.pop(room.token, None)
            return room

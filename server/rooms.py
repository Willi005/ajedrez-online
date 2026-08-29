"""Token-based game rooms shared by every client thread.

One thread serves each connected client, so all access to the room table goes
through a single reentrant lock. Every public method here is safe to call from
any thread.
"""

import secrets
import threading
import time

from server.protocol import TOKEN_ALPHABET, TOKEN_LENGTH

# Give up rather than spin forever if the token space is somehow exhausted.
MAX_TOKEN_ATTEMPTS = 100

# The one time control the app offers: five minutes each, no increment, so a
# whole game fits in ten.
#
# The clock lives here rather than in the browser because it is the one part of
# a game a player must not be able to decide for themselves. The rules can stay
# in the client — a client that lies about them only breaks its own board, since
# the opponent validates the same position — but a client that lies about the
# clock steals time from someone else.
INITIAL_TIME_SECONDS = 300.0


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

        # Seconds banked by each side, charged only while it is their move.
        self.clock = {
            "white": INITIAL_TIME_SECONDS,
            "black": INITIAL_TIME_SECONDS,
        }
        # When the side to move started thinking, on the monotonic clock. None
        # until the game starts and again once it ends, which is what stops the
        # clock from running in a room nobody is playing in.
        self.turn_started_at = None

    # -- the clock ---------------------------------------------------------
    #
    # Every method below assumes the registry's lock is held. `now` is passed in
    # rather than read here so the whole clock can be driven deterministically
    # from the tests.

    def start_clock(self, now):
        self.turn_started_at = now

    def elapsed(self, now):
        """Seconds the side to move has been thinking, or 0 with the clock stopped."""
        if self.turn_started_at is None:
            return 0.0
        return max(0.0, now - self.turn_started_at)

    def time_left(self, now):
        """Both clocks as they stand right now, with the running one charged."""
        left = dict(self.clock)
        left[self.turn] = max(0.0, left[self.turn] - self.elapsed(now))
        return left

    def flagged_color(self, now):
        """The side whose time has run out, or None while both still have some."""
        if self.turn_started_at is None:
            return None
        if self.clock[self.turn] - self.elapsed(now) <= 0.0:
            return self.turn
        return None

    def stop_clock(self, now):
        """Charge the running side and stop, so a finished game holds its figures."""
        if self.turn_started_at is not None:
            self.clock[self.turn] = max(0.0, self.clock[self.turn] - self.elapsed(now))
            self.turn_started_at = None

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

    def __init__(self, token_factory=_default_token_factory, clock=time.monotonic):
        # `clock` is injected so the tests can move time by hand instead of
        # sleeping through a ten-minute game.
        self._clock = clock
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
            # The clock starts when the second player sits down, not when the
            # room is created: the host must not lose time waiting for a rival.
            room.start_clock(self._clock())
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
        """Check the turn, charge the clock, hand the turn over.

        Returns `(room, time_left, flagged)`. `flagged` is the colour whose time
        ran out on this move, or None. When it is set the move was not applied:
        the game had already ended when it arrived, and the caller must announce
        the loss on time instead of relaying the move.
        """
        with self._lock:
            room = self._room_by_connection.get(connection)
            if room is None:
                raise RoomError("NOT_IN_ROOM", "No estás en una partida.")
            if room.status != "playing":
                raise RoomError("GAME_NOT_STARTED", "La partida aún no comienza.")

            player = room.player_for(connection)
            if player.color != room.turn:
                raise RoomError("NOT_YOUR_TURN", "No es tu turno.")

            now = self._clock()

            # A move and the sweeper below can reach a room whose flag has just
            # fallen at the same moment; both go through this lock, so whichever
            # arrives first decides, and the other finds the game already over.
            flagged = room.flagged_color(now)
            if flagged is not None:
                room.stop_clock(now)
                room.status = "finished"
                return room, room.time_left(now), flagged

            room.clock[room.turn] = max(0.0, room.clock[room.turn] - room.elapsed(now))
            room.turn = "black" if room.turn == "white" else "white"
            room.start_clock(now)
            return room, room.time_left(now), None

    def time_left(self, connection):
        """Both clocks in this player's room, or None if they are not in one."""
        with self._lock:
            room = self._room_by_connection.get(connection)
            return None if room is None else room.time_left(self._clock())

    def expire_timeouts(self):
        """Find rooms whose clock has run out and end them.

        Returns `[(room, loser_color)]`. A game can end without anybody sending
        anything — that is the whole point of a clock — so somebody has to look,
        and that somebody is the sweeper thread in server.py.
        """
        expired = []
        with self._lock:
            now = self._clock()
            for room in self._rooms.values():
                if room.status != "playing":
                    continue
                flagged = room.flagged_color(now)
                if flagged is None:
                    continue
                room.stop_clock(now)
                room.status = "finished"
                expired.append((room, flagged))
        return expired

    def leave(self, connection):
        """Remove a player. Returns the room they left, or None if they had none."""
        with self._lock:
            room = self._room_by_connection.pop(connection, None)
            if room is None:
                return None

            room.status = "finished"
            room.stop_clock(self._clock())
            player = room.player_for(connection)
            if player is not None:
                if room.white is player:
                    room.white = None
                else:
                    room.black = None

            if room.white is None and room.black is None:
                self._rooms.pop(room.token, None)
            return room

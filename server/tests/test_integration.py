"""End-to-end tests: a real TCP server, real sockets, real WebSocket frames.

These are the tests that prove the whole block works together. Nothing here is
mocked; the client used is the same raw-socket client shipped in tools/.
"""

import threading
import unittest

from server.rooms import INITIAL_TIME_SECONDS
from server.server import ChessServer
from tools.ws_client import WebSocketClient


class FakeClock:
    """A monotonic clock the test drives by hand, shared by the timing tests."""

    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class ServerTestCase(unittest.TestCase):
    """Boots a server on an ephemeral port and tears it down after each test."""

    def setUp(self):
        self.server = ChessServer(host="127.0.0.1", port=0)
        self.server.bind()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.clients = []

    def tearDown(self):
        for client in self.clients:
            try:
                client.close()
            except OSError:
                pass
        self.server.stop()
        self.thread.join(timeout=5)

    def new_client(self):
        client = WebSocketClient("127.0.0.1", self.server.port)
        client.connect()
        self.clients.append(client)
        return client

    def receive(self, client, timeout=None):
        """The next message that is not a clock reading.

        The clock is a background stream — it follows `start`, every move and
        every ending — so a test asking about anything else should not have to
        know where in the sequence it lands. The clock's own tests read it
        directly with `receive_json`.
        """
        while True:
            message = (
                client.receive_json()
                if timeout is None
                else client.receive_json(timeout=timeout)
            )
            if message["type"] != "clock":
                return message

    def seated_game(self):
        """Return two connected clients already sharing a started game."""
        white = self.new_client()
        white.send_json({"type": "create", "nickname": "ana"})
        created = self.receive(white)

        black = self.new_client()
        black.send_json({"type": "join", "token": created["token"], "nickname": "beto"})

        white_start = self.receive(white)
        black_start = self.receive(black)
        return white, black, created["token"], white_start, black_start


class HandshakeTest(ServerTestCase):
    def test_server_reports_the_port_it_actually_bound(self):
        self.assertGreater(self.server.port, 0)

    def test_client_completes_the_websocket_handshake(self):
        client = self.new_client()

        self.assertTrue(client.connected)


class CreateAndJoinTest(ServerTestCase):
    def test_create_returns_a_token_and_assigns_white(self):
        client = self.new_client()

        client.send_json({"type": "create", "nickname": "ana"})
        response = self.receive(client)

        self.assertEqual(response["type"], "created")
        self.assertEqual(response["color"], "white")
        self.assertEqual(len(response["token"]), 5)

    def test_both_players_are_told_the_game_started(self):
        _, _, token, white_start, black_start = self.seated_game()

        self.assertEqual(white_start["type"], "start")
        self.assertEqual(white_start["color"], "white")
        self.assertEqual(white_start["opponent"], "beto")

        self.assertEqual(black_start["type"], "start")
        self.assertEqual(black_start["color"], "black")
        self.assertEqual(black_start["opponent"], "ana")
        self.assertEqual(black_start["token"], token)

    def test_joining_an_unknown_token_reports_room_not_found(self):
        client = self.new_client()

        client.send_json({"type": "join", "token": "ZZZZZ", "nickname": "beto"})
        response = self.receive(client)

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "ROOM_NOT_FOUND")

    def test_a_third_player_is_turned_away(self):
        _, _, token, _, _ = self.seated_game()
        third = self.new_client()

        third.send_json({"type": "join", "token": token, "nickname": "caro"})
        response = self.receive(third)

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "ROOM_FULL")


class MoveRelayTest(ServerTestCase):
    def test_a_move_reaches_the_opponent(self):
        white, black, _, _, _ = self.seated_game()

        white.send_json(
            {"type": "move", "from": "e2", "to": "e4", "fen": "after-e4"}
        )
        relayed = self.receive(black)

        self.assertEqual(relayed["type"], "move")
        self.assertEqual(relayed["from"], "e2")
        self.assertEqual(relayed["to"], "e4")
        self.assertEqual(relayed["fen"], "after-e4")

    def test_moving_out_of_turn_is_rejected(self):
        _, black, _, _, _ = self.seated_game()

        black.send_json({"type": "move", "from": "e7", "to": "e5", "fen": "nope"})
        response = self.receive(black)

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "NOT_YOUR_TURN")

    def test_turn_alternates_between_the_players(self):
        white, black, _, _, _ = self.seated_game()

        white.send_json({"type": "move", "from": "e2", "to": "e4", "fen": "1"})
        self.receive(black)

        black.send_json({"type": "move", "from": "e7", "to": "e5", "fen": "2"})
        relayed = self.receive(white)

        self.assertEqual(relayed["type"], "move")
        self.assertEqual(relayed["from"], "e7")

    def test_an_invalid_square_is_rejected_before_reaching_the_opponent(self):
        white, _, _, _, _ = self.seated_game()

        white.send_json({"type": "move", "from": "e2", "to": "j9", "fen": "1"})
        response = self.receive(white)

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "INVALID_SQUARE")


class ChatRelayTest(ServerTestCase):
    def test_chat_reaches_the_opponent_with_the_sender_nickname(self):
        white, black, _, _, _ = self.seated_game()

        white.send_json({"type": "chat", "text": "suerte"})
        relayed = self.receive(black)

        self.assertEqual(relayed["type"], "chat")
        self.assertEqual(relayed["from"], "ana")
        self.assertEqual(relayed["text"], "suerte")

    def test_an_empty_chat_line_is_rejected(self):
        white, _, _, _, _ = self.seated_game()

        white.send_json({"type": "chat", "text": "   "})
        response = self.receive(white)

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "INVALID_CHAT")


class ResignTest(ServerTestCase):
    def test_resigning_ends_the_game_for_both_players(self):
        white, black, _, _, _ = self.seated_game()

        white.send_json({"type": "resign"})

        for client, label in ((white, "white"), (black, "black")):
            message = self.receive(client)
            self.assertEqual(message["type"], "game_over", label)
            self.assertEqual(message["reason"], "resign", label)
            self.assertEqual(message["winner"], "black", label)


class ClockTest(ServerTestCase):
    def test_both_players_get_a_full_clock_when_the_game_starts(self):
        white, black, _, _, _ = self.seated_game()

        for client, label in ((white, "white"), (black, "black")):
            reading = client.receive_json()
            self.assertEqual(reading["type"], "clock", label)
            self.assertEqual(reading["white"], INITIAL_TIME_SECONDS, label)
            self.assertEqual(reading["black"], INITIAL_TIME_SECONDS, label)
            self.assertEqual(reading["turn"], "white", label)
            self.assertTrue(reading["running"], label)

    def test_a_move_sends_a_reading_to_both_players(self):
        white, black, _, _, _ = self.seated_game()
        white.receive_json()
        black.receive_json()

        white.send_json({"type": "move", "from": "e2", "to": "e4", "fen": "1"})

        # The mover is told as well as the opponent: each side's picture of the
        # other's clock is only as right as the last reading it was sent.
        mover = white.receive_json()
        self.assertEqual(mover["type"], "clock")
        self.assertEqual(mover["turn"], "black")

        self.assertEqual(self.receive(black)["type"], "move")
        watcher = black.receive_json()
        self.assertEqual(watcher["type"], "clock")
        self.assertEqual(watcher["turn"], "black")

    def test_running_at_most_the_time_it_started_with(self):
        white, _, _, _, _ = self.seated_game()

        reading = white.receive_json()

        self.assertLessEqual(reading["white"], INITIAL_TIME_SECONDS)
        self.assertGreater(reading["white"], INITIAL_TIME_SECONDS - 5)


class ClockExpiryTest(unittest.TestCase):
    """The one ending nobody sends a message for.

    Driven with an injected clock over real sockets, so what is exercised is the
    sweeper thread and the frames it writes, not a stub.
    """

    def setUp(self):
        self.clock = FakeClock()
        self.server = ChessServer(host="127.0.0.1", port=0, clock=self.clock)
        self.server.bind()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.clients = []

    def tearDown(self):
        for client in self.clients:
            try:
                client.close()
            except OSError:
                pass
        self.server.stop()
        self.thread.join(timeout=5)

    def new_client(self):
        client = WebSocketClient("127.0.0.1", self.server.port)
        client.connect()
        self.clients.append(client)
        return client

    def test_the_game_ends_on_its_own_when_a_clock_runs_out(self):
        white = self.new_client()
        white.send_json({"type": "create", "nickname": "ana"})
        token = white.receive_json()["token"]

        black = self.new_client()
        black.send_json({"type": "join", "token": token, "nickname": "beto"})
        white.receive_json()  # start
        black.receive_json()  # start
        white.receive_json()  # first clock
        black.receive_json()  # first clock

        # Nobody sends anything. White simply runs out.
        self.clock.advance(INITIAL_TIME_SECONDS + 1)

        for client, label in ((white, "white"), (black, "black")):
            reading = client.receive_json(timeout=5)
            self.assertEqual(reading["type"], "clock", label)
            self.assertEqual(reading["white"], 0.0, label)
            self.assertFalse(reading["running"], label)

            ending = client.receive_json(timeout=5)
            self.assertEqual(ending["type"], "game_over", label)
            self.assertEqual(ending["reason"], "timeout", label)
            self.assertEqual(ending["winner"], "black", label)


class MalformedInputTest(ServerTestCase):
    def test_text_that_is_not_json_is_rejected(self):
        client = self.new_client()

        client.send_text("this is not json")
        response = self.receive(client)

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "BAD_JSON")

    def test_an_unknown_message_type_is_rejected(self):
        client = self.new_client()

        client.send_json({"type": "launch_missiles"})
        response = self.receive(client)

        self.assertEqual(response["code"], "UNKNOWN_TYPE")

    def test_the_connection_survives_a_rejected_message(self):
        client = self.new_client()

        client.send_json({"type": "nonsense"})
        self.receive(client)

        client.send_json({"type": "create", "nickname": "ana"})
        response = self.receive(client)

        self.assertEqual(response["type"], "created")

    def test_acting_without_a_room_is_rejected(self):
        client = self.new_client()

        client.send_json({"type": "chat", "text": "hola?"})
        response = self.receive(client)

        self.assertEqual(response["code"], "NOT_IN_ROOM")


class DisconnectTest(ServerTestCase):
    def test_the_remaining_player_is_told_the_opponent_left(self):
        white, black, _, _, _ = self.seated_game()

        black.close()
        message = self.receive(white, timeout=5)

        self.assertEqual(message["type"], "opponent_left")


if __name__ == "__main__":
    unittest.main()

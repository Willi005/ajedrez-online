"""End-to-end tests: a real TCP server, real sockets, real WebSocket frames.

These are the tests that prove the whole block works together. Nothing here is
mocked; the client used is the same raw-socket client shipped in tools/.
"""

import threading
import unittest

from server.server import ChessServer
from tools.ws_client import WebSocketClient


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

    def seated_game(self):
        """Return two connected clients already sharing a started game."""
        white = self.new_client()
        white.send_json({"type": "create", "nickname": "ana"})
        created = white.receive_json()

        black = self.new_client()
        black.send_json({"type": "join", "token": created["token"], "nickname": "beto"})

        white_start = white.receive_json()
        black_start = black.receive_json()
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
        response = client.receive_json()

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
        response = client.receive_json()

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "ROOM_NOT_FOUND")

    def test_a_third_player_is_turned_away(self):
        _, _, token, _, _ = self.seated_game()
        third = self.new_client()

        third.send_json({"type": "join", "token": token, "nickname": "caro"})
        response = third.receive_json()

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "ROOM_FULL")


class MoveRelayTest(ServerTestCase):
    def test_a_move_reaches_the_opponent(self):
        white, black, _, _, _ = self.seated_game()

        white.send_json(
            {"type": "move", "from": "e2", "to": "e4", "fen": "after-e4"}
        )
        relayed = black.receive_json()

        self.assertEqual(relayed["type"], "move")
        self.assertEqual(relayed["from"], "e2")
        self.assertEqual(relayed["to"], "e4")
        self.assertEqual(relayed["fen"], "after-e4")

    def test_moving_out_of_turn_is_rejected(self):
        _, black, _, _, _ = self.seated_game()

        black.send_json({"type": "move", "from": "e7", "to": "e5", "fen": "nope"})
        response = black.receive_json()

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "NOT_YOUR_TURN")

    def test_turn_alternates_between_the_players(self):
        white, black, _, _, _ = self.seated_game()

        white.send_json({"type": "move", "from": "e2", "to": "e4", "fen": "1"})
        black.receive_json()

        black.send_json({"type": "move", "from": "e7", "to": "e5", "fen": "2"})
        relayed = white.receive_json()

        self.assertEqual(relayed["type"], "move")
        self.assertEqual(relayed["from"], "e7")

    def test_an_invalid_square_is_rejected_before_reaching_the_opponent(self):
        white, _, _, _, _ = self.seated_game()

        white.send_json({"type": "move", "from": "e2", "to": "j9", "fen": "1"})
        response = white.receive_json()

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "INVALID_SQUARE")


class ChatRelayTest(ServerTestCase):
    def test_chat_reaches_the_opponent_with_the_sender_nickname(self):
        white, black, _, _, _ = self.seated_game()

        white.send_json({"type": "chat", "text": "suerte"})
        relayed = black.receive_json()

        self.assertEqual(relayed["type"], "chat")
        self.assertEqual(relayed["from"], "ana")
        self.assertEqual(relayed["text"], "suerte")

    def test_an_empty_chat_line_is_rejected(self):
        white, _, _, _, _ = self.seated_game()

        white.send_json({"type": "chat", "text": "   "})
        response = white.receive_json()

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "INVALID_CHAT")


class ResignTest(ServerTestCase):
    def test_resigning_ends_the_game_for_both_players(self):
        white, black, _, _, _ = self.seated_game()

        white.send_json({"type": "resign"})

        for client, label in ((white, "white"), (black, "black")):
            message = client.receive_json()
            self.assertEqual(message["type"], "game_over", label)
            self.assertEqual(message["reason"], "resign", label)
            self.assertEqual(message["winner"], "black", label)


class MalformedInputTest(ServerTestCase):
    def test_text_that_is_not_json_is_rejected(self):
        client = self.new_client()

        client.send_text("this is not json")
        response = client.receive_json()

        self.assertEqual(response["type"], "error")
        self.assertEqual(response["code"], "BAD_JSON")

    def test_an_unknown_message_type_is_rejected(self):
        client = self.new_client()

        client.send_json({"type": "launch_missiles"})
        response = client.receive_json()

        self.assertEqual(response["code"], "UNKNOWN_TYPE")

    def test_the_connection_survives_a_rejected_message(self):
        client = self.new_client()

        client.send_json({"type": "nonsense"})
        client.receive_json()

        client.send_json({"type": "create", "nickname": "ana"})
        response = client.receive_json()

        self.assertEqual(response["type"], "created")

    def test_acting_without_a_room_is_rejected(self):
        client = self.new_client()

        client.send_json({"type": "chat", "text": "hola?"})
        response = client.receive_json()

        self.assertEqual(response["code"], "NOT_IN_ROOM")


class DisconnectTest(ServerTestCase):
    def test_the_remaining_player_is_told_the_opponent_left(self):
        white, black, _, _, _ = self.seated_game()

        black.close()
        message = white.receive_json(timeout=5)

        self.assertEqual(message["type"], "opponent_left")


if __name__ == "__main__":
    unittest.main()

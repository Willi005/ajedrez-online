"""Tests for the layered validation applied to every incoming client message."""

import json
import unittest

from server.protocol import (
    MAX_CHAT_LENGTH,
    MAX_NICKNAME_LENGTH,
    ValidationError,
    validate_client_message,
)


def raw(payload):
    return json.dumps(payload)


class MessageEnvelopeTest(unittest.TestCase):
    def test_rejects_text_that_is_not_json(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message("not json at all")

        self.assertEqual(ctx.exception.code, "BAD_JSON")

    def test_rejects_json_that_is_not_an_object(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message("[1, 2, 3]")

        self.assertEqual(ctx.exception.code, "BAD_JSON")

    def test_rejects_message_without_a_type(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(raw({"nickname": "ana"}))

        self.assertEqual(ctx.exception.code, "MISSING_TYPE")

    def test_rejects_unknown_type(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(raw({"type": "launch_missiles"}))

        self.assertEqual(ctx.exception.code, "UNKNOWN_TYPE")


class CreateMessageTest(unittest.TestCase):
    def test_accepts_a_valid_nickname(self):
        message = validate_client_message(raw({"type": "create", "nickname": "ana"}))

        self.assertEqual(message, {"type": "create", "nickname": "ana"})

    def test_trims_surrounding_whitespace_from_the_nickname(self):
        message = validate_client_message(raw({"type": "create", "nickname": "  ana  "}))

        self.assertEqual(message["nickname"], "ana")

    def test_rejects_an_empty_nickname(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(raw({"type": "create", "nickname": "   "}))

        self.assertEqual(ctx.exception.code, "INVALID_NICKNAME")

    def test_rejects_a_nickname_that_is_too_long(self):
        long_nickname = "a" * (MAX_NICKNAME_LENGTH + 1)

        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(raw({"type": "create", "nickname": long_nickname}))

        self.assertEqual(ctx.exception.code, "INVALID_NICKNAME")

    def test_rejects_a_nickname_containing_control_characters(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(raw({"type": "create", "nickname": "an\x00a"}))

        self.assertEqual(ctx.exception.code, "INVALID_NICKNAME")

    def test_rejects_a_nickname_that_is_not_a_string(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(raw({"type": "create", "nickname": 42}))

        self.assertEqual(ctx.exception.code, "INVALID_NICKNAME")


class JoinMessageTest(unittest.TestCase):
    def test_accepts_a_well_formed_token(self):
        message = validate_client_message(
            raw({"type": "join", "token": "7QK2P", "nickname": "beto"})
        )

        self.assertEqual(message["token"], "7QK2P")
        self.assertEqual(message["nickname"], "beto")

    def test_uppercases_a_lowercase_token(self):
        message = validate_client_message(
            raw({"type": "join", "token": "7qk2p", "nickname": "beto"})
        )

        self.assertEqual(message["token"], "7QK2P")

    def test_rejects_a_token_of_the_wrong_length(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(
                raw({"type": "join", "token": "7QK2", "nickname": "beto"})
            )

        self.assertEqual(ctx.exception.code, "INVALID_TOKEN_FORMAT")

    def test_rejects_a_token_with_characters_outside_the_alphabet(self):
        # I, L, O, 0 and 1 are excluded so tokens can be read aloud unambiguously.
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(
                raw({"type": "join", "token": "7QK2O", "nickname": "beto"})
            )

        self.assertEqual(ctx.exception.code, "INVALID_TOKEN_FORMAT")

    def test_rejects_a_missing_token(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(raw({"type": "join", "nickname": "beto"}))

        self.assertEqual(ctx.exception.code, "INVALID_TOKEN_FORMAT")


class MoveMessageTest(unittest.TestCase):
    def test_accepts_a_well_formed_move(self):
        message = validate_client_message(
            raw({"type": "move", "from": "e2", "to": "e4", "fen": "startpos"})
        )

        self.assertEqual(message["from"], "e2")
        self.assertEqual(message["to"], "e4")
        self.assertIsNone(message["promotion"])

    def test_accepts_a_promotion_piece(self):
        message = validate_client_message(
            raw(
                {
                    "type": "move",
                    "from": "e7",
                    "to": "e8",
                    "promotion": "q",
                    "fen": "startpos",
                }
            )
        )

        self.assertEqual(message["promotion"], "q")

    def test_rejects_a_square_outside_the_board(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(
                raw({"type": "move", "from": "e2", "to": "j9", "fen": "startpos"})
            )

        self.assertEqual(ctx.exception.code, "INVALID_SQUARE")

    def test_rejects_a_malformed_square(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(
                raw({"type": "move", "from": "2e", "to": "e4", "fen": "startpos"})
            )

        self.assertEqual(ctx.exception.code, "INVALID_SQUARE")

    def test_rejects_an_illegal_promotion_piece(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(
                raw(
                    {
                        "type": "move",
                        "from": "e7",
                        "to": "e8",
                        "promotion": "k",
                        "fen": "startpos",
                    }
                )
            )

        self.assertEqual(ctx.exception.code, "INVALID_PROMOTION")

    def test_rejects_a_move_without_a_fen(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(raw({"type": "move", "from": "e2", "to": "e4"}))

        self.assertEqual(ctx.exception.code, "INVALID_FEN")


class ChatMessageTest(unittest.TestCase):
    def test_accepts_a_normal_chat_line(self):
        message = validate_client_message(raw({"type": "chat", "text": "buena jugada"}))

        self.assertEqual(message["text"], "buena jugada")

    def test_rejects_an_empty_chat_line(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(raw({"type": "chat", "text": "   "}))

        self.assertEqual(ctx.exception.code, "INVALID_CHAT")

    def test_rejects_a_chat_line_that_is_too_long(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(
                raw({"type": "chat", "text": "a" * (MAX_CHAT_LENGTH + 1)})
            )

        self.assertEqual(ctx.exception.code, "INVALID_CHAT")

    def test_strips_control_characters_from_chat_text(self):
        message = validate_client_message(raw({"type": "chat", "text": "hola\x07mundo"}))

        self.assertEqual(message["text"], "holamundo")


class ResignMessageTest(unittest.TestCase):
    def test_accepts_resign_without_extra_fields(self):
        message = validate_client_message(raw({"type": "resign"}))

        self.assertEqual(message, {"type": "resign"})


class GameEndTest(unittest.TestCase):
    def test_accepts_a_checkmate_with_a_winner(self):
        message = validate_client_message(
            json.dumps({"type": "game_end", "reason": "checkmate", "winner": "white"})
        )

        self.assertEqual(message["reason"], "checkmate")
        self.assertEqual(message["winner"], "white")

    def test_accepts_a_draw_with_no_winner(self):
        message = validate_client_message(
            json.dumps({"type": "game_end", "reason": "draw", "winner": None})
        )

        self.assertEqual(message["reason"], "draw")
        self.assertIsNone(message["winner"])

    def test_rejects_a_reason_the_client_cannot_decide(self):
        # Resigning and running out of time are the server's to declare, so a
        # client must not be able to report them as a board result.
        for reason in ("resign", "timeout", "victory", ""):
            with self.subTest(reason=reason):
                with self.assertRaises(ValidationError) as ctx:
                    validate_client_message(
                        json.dumps(
                            {"type": "game_end", "reason": reason, "winner": "white"}
                        )
                    )
                self.assertEqual(ctx.exception.code, "INVALID_REASON")

    def test_rejects_a_draw_that_claims_a_winner(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(
                json.dumps({"type": "game_end", "reason": "draw", "winner": "white"})
            )

        self.assertEqual(ctx.exception.code, "INVALID_WINNER")

    def test_rejects_a_checkmate_with_no_winner(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_client_message(
                json.dumps({"type": "game_end", "reason": "checkmate", "winner": None})
            )

        self.assertEqual(ctx.exception.code, "INVALID_WINNER")


if __name__ == "__main__":
    unittest.main()

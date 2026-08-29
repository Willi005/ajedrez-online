"""Validation of every message the server accepts from a client.

The server deliberately validates transport and session concerns only: message
shape, field types, value ranges, room membership and turn ownership. Chess rule
legality is decided by the client, which owns the game engine.

Validation is layered, and each layer fails with a stable error code so the
client can react to the cause rather than parse a human-readable string.
"""

import json
import re

MAX_NICKNAME_LENGTH = 16
MAX_CHAT_LENGTH = 200
MAX_FEN_LENGTH = 100

# Token alphabet without I, L, O, 0 and 1, so a token can be read aloud or
# written down without ambiguity.
TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
TOKEN_LENGTH = 5
TOKEN_PATTERN = re.compile(rf"^[{TOKEN_ALPHABET}]{{{TOKEN_LENGTH}}}$")

SQUARE_PATTERN = re.compile(r"^[a-h][1-8]$")
PROMOTION_PIECES = frozenset("qrbn")

CLIENT_MESSAGE_TYPES = frozenset(
    {"create", "join", "move", "chat", "resign", "game_end"}
)

# The two endings only the clients can see. The rules live in the browser by
# design 2.3, so the server never learns that a position is mate — but with a
# clock running it has to be told, or it would go on charging a game that ended
# and eventually award it on time to the player who was mated.
BOARD_ENDINGS = frozenset({"checkmate", "draw"})
COLORS = frozenset({"white", "black"})


class ValidationError(Exception):
    """Raised when a client message is malformed or out of range."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def _strip_control_characters(text):
    """Remove control characters, which have no place in a nickname or chat line."""
    return "".join(char for char in text if char.isprintable() or char == " ")


def _validate_nickname(payload):
    nickname = payload.get("nickname")
    if not isinstance(nickname, str):
        raise ValidationError("INVALID_NICKNAME", "El apodo debe ser texto.")

    if nickname != _strip_control_characters(nickname):
        raise ValidationError("INVALID_NICKNAME", "El apodo contiene caracteres no válidos.")

    nickname = nickname.strip()
    if not 1 <= len(nickname) <= MAX_NICKNAME_LENGTH:
        raise ValidationError(
            "INVALID_NICKNAME",
            f"El apodo debe tener entre 1 y {MAX_NICKNAME_LENGTH} caracteres.",
        )
    return nickname


def _validate_token(payload):
    token = payload.get("token")
    if not isinstance(token, str):
        raise ValidationError("INVALID_TOKEN_FORMAT", "El token debe ser texto.")

    token = token.strip().upper()
    if not TOKEN_PATTERN.match(token):
        raise ValidationError(
            "INVALID_TOKEN_FORMAT",
            f"El token debe tener {TOKEN_LENGTH} caracteres del alfabeto permitido.",
        )
    return token


def _validate_square(payload, field):
    square = payload.get(field)
    if not isinstance(square, str) or not SQUARE_PATTERN.match(square):
        raise ValidationError(
            "INVALID_SQUARE", f"La casilla '{field}' no pertenece al tablero."
        )
    return square


def _validate_promotion(payload):
    promotion = payload.get("promotion")
    if promotion is None:
        return None
    if not isinstance(promotion, str) or promotion not in PROMOTION_PIECES:
        raise ValidationError(
            "INVALID_PROMOTION", "La pieza de promoción debe ser q, r, b o n."
        )
    return promotion


def _validate_fen(payload):
    fen = payload.get("fen")
    if not isinstance(fen, str) or not 1 <= len(fen) <= MAX_FEN_LENGTH:
        raise ValidationError("INVALID_FEN", "La posición FEN es inválida.")
    return fen


def _validate_chat_text(payload):
    text = payload.get("text")
    if not isinstance(text, str):
        raise ValidationError("INVALID_CHAT", "El mensaje debe ser texto.")

    text = _strip_control_characters(text).strip()
    if not 1 <= len(text) <= MAX_CHAT_LENGTH:
        raise ValidationError(
            "INVALID_CHAT", f"El mensaje debe tener entre 1 y {MAX_CHAT_LENGTH} caracteres."
        )
    return text


def _validate_board_ending(payload):
    """Check the `reason`/`winner` pair a client reports for its own board."""
    reason = payload.get("reason")
    if reason not in BOARD_ENDINGS:
        raise ValidationError(
            "INVALID_REASON",
            "El motivo debe ser 'checkmate' o 'draw'.",
        )

    winner = payload.get("winner")
    if reason == "draw":
        if winner is not None:
            raise ValidationError("INVALID_WINNER", "Unas tablas no tienen ganador.")
        return reason, None

    if winner not in COLORS:
        raise ValidationError("INVALID_WINNER", "El ganador debe ser 'white' o 'black'.")
    return reason, winner


def validate_client_message(text):
    """Validate one raw client message and return it normalised.

    Raises ValidationError with a stable `code` when any layer rejects it.
    """
    # Layer 1: the payload must be JSON.
    try:
        payload = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise ValidationError("BAD_JSON", "El mensaje no es JSON válido.") from exc

    # Layer 2: the payload must be a JSON object.
    if not isinstance(payload, dict):
        raise ValidationError("BAD_JSON", "El mensaje debe ser un objeto JSON.")

    # Layer 3: the object must carry a known message type.
    message_type = payload.get("type")
    if not isinstance(message_type, str):
        raise ValidationError("MISSING_TYPE", "Falta el campo 'type'.")
    if message_type not in CLIENT_MESSAGE_TYPES:
        raise ValidationError("UNKNOWN_TYPE", f"Tipo de mensaje desconocido: {message_type}")

    # Layer 4: fields required by that specific type must be present and in range.
    if message_type == "create":
        return {"type": "create", "nickname": _validate_nickname(payload)}

    if message_type == "join":
        return {
            "type": "join",
            "token": _validate_token(payload),
            "nickname": _validate_nickname(payload),
        }

    if message_type == "move":
        return {
            "type": "move",
            "from": _validate_square(payload, "from"),
            "to": _validate_square(payload, "to"),
            "promotion": _validate_promotion(payload),
            "fen": _validate_fen(payload),
        }

    if message_type == "chat":
        return {"type": "chat", "text": _validate_chat_text(payload)}

    if message_type == "game_end":
        reason, winner = _validate_board_ending(payload)
        return {"type": "game_end", "reason": reason, "winner": winner}

    return {"type": "resign"}

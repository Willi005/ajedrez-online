"""Minimal RFC 6455 WebSocket implementation written directly on top of TCP sockets.

No third-party libraries are used: the handshake and the frame codec are
implemented by hand so that every step of the protocol stays visible.
"""

import base64
import hashlib
import secrets
from typing import NamedTuple

# Magic GUID defined by RFC 6455 section 4.2.2. It is appended to the client key
# before hashing so that the response cannot be forged by a cache or a proxy.
WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

SUPPORTED_VERSION = "13"

# Frame opcodes, RFC 6455 section 5.2.
OPCODE_CONTINUATION = 0x0
OPCODE_TEXT = 0x1
OPCODE_BINARY = 0x2
OPCODE_CLOSE = 0x8
OPCODE_PING = 0x9
OPCODE_PONG = 0xA

# Close status codes, RFC 6455 section 7.4.1.
CLOSE_NORMAL = 1000
CLOSE_PROTOCOL_ERROR = 1002
CLOSE_UNSUPPORTED_DATA = 1003
CLOSE_MESSAGE_TOO_BIG = 1009

# Any single frame larger than this is refused before it is buffered, so a
# misbehaving client cannot exhaust the server's memory.
MAX_PAYLOAD_BYTES = 4096


class HandshakeError(Exception):
    """Raised when the opening HTTP request is not a valid WebSocket upgrade."""


class ProtocolError(Exception):
    """Raised when a received frame violates RFC 6455."""


class Frame(NamedTuple):
    fin: bool
    opcode: int
    payload: bytes


def compute_accept_key(client_key):
    """Derive the Sec-WebSocket-Accept value from the client's Sec-WebSocket-Key."""
    digest = hashlib.sha1((client_key + WEBSOCKET_GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


def parse_headers(raw_request):
    """Parse the opening HTTP request into a dict with lowercased header names."""
    try:
        text = raw_request.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise HandshakeError("handshake request is not valid UTF-8") from exc

    lines = text.split("\r\n")
    headers = {}
    for line in lines[1:]:
        if not line:
            break
        name, separator, value = line.partition(":")
        if not separator:
            raise HandshakeError(f"malformed header line: {line!r}")
        headers[name.strip().lower()] = value.strip()
    return headers


def build_handshake_response(raw_request):
    """Validate the client upgrade request and build the 101 response bytes."""
    headers = parse_headers(raw_request)

    if headers.get("upgrade", "").lower() != "websocket":
        raise HandshakeError("missing or invalid Upgrade header")
    if "upgrade" not in headers.get("connection", "").lower():
        raise HandshakeError("missing or invalid Connection header")
    if headers.get("sec-websocket-version") != SUPPORTED_VERSION:
        raise HandshakeError("unsupported Sec-WebSocket-Version")

    client_key = headers.get("sec-websocket-key")
    if not client_key:
        raise HandshakeError("missing Sec-WebSocket-Key header")

    return (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {compute_accept_key(client_key)}\r\n"
        "\r\n"
    ).encode("ascii")


def decode_frame(buffer, expect_mask=True):
    """Decode one frame from the head of `buffer`.

    Returns `(frame, rest)`. When the buffer does not yet hold a whole frame,
    returns `(None, buffer)` so the caller can recv() more bytes and retry.

    `expect_mask` encodes the asymmetry of RFC 6455: client-to-server frames are
    always masked, server-to-client frames never are. The server decodes with
    `expect_mask=True`, a client decodes with `expect_mask=False`.
    """
    if len(buffer) < 2:
        return None, buffer

    first, second = buffer[0], buffer[1]
    fin = bool(first & 0x80)
    opcode = first & 0x0F
    is_masked = bool(second & 0x80)
    length = second & 0x7F
    offset = 2

    if length == 126:
        if len(buffer) < offset + 2:
            return None, buffer
        length = int.from_bytes(buffer[offset : offset + 2], "big")
        offset += 2
    elif length == 127:
        if len(buffer) < offset + 8:
            return None, buffer
        length = int.from_bytes(buffer[offset : offset + 8], "big")
        offset += 8

    # RFC 6455 section 5.1: frames sent from client to server must be masked,
    # and frames sent the other way must not be.
    if expect_mask and not is_masked:
        raise ProtocolError("client frame is not masked")
    if not expect_mask and is_masked:
        raise ProtocolError("server frame must not be masked")

    if is_masked:
        if len(buffer) < offset + 4:
            return None, buffer
        mask = buffer[offset : offset + 4]
        offset += 4
    else:
        mask = None

    if len(buffer) < offset + length:
        return None, buffer

    payload = buffer[offset : offset + length]
    if mask is not None:
        payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
    return Frame(fin, opcode, payload), buffer[offset + length :]


def encode_frame(opcode, payload, mask=False):
    """Build a frame carrying `payload`.

    The server never masks; a client always must, with a fresh random key per
    frame (RFC 6455 section 5.3).
    """
    header = bytearray()
    header.append(0x80 | opcode)

    length = len(payload)
    mask_bit = 0x80 if mask else 0x00
    if length < 126:
        header.append(mask_bit | length)
    elif length < 65536:
        header.append(mask_bit | 126)
        header.extend(length.to_bytes(2, "big"))
    else:
        header.append(mask_bit | 127)
        header.extend(length.to_bytes(8, "big"))

    if not mask:
        return bytes(header) + payload

    masking_key = secrets.token_bytes(4)
    masked = bytes(byte ^ masking_key[i % 4] for i, byte in enumerate(payload))
    return bytes(header) + masking_key + masked


def encode_text_frame(text):
    """Build a text frame carrying `text` encoded as UTF-8."""
    return encode_frame(OPCODE_TEXT, text.encode("utf-8"))


def encode_close_frame(code=CLOSE_NORMAL, reason=""):
    """Build a close frame carrying a status code and an optional reason."""
    return encode_frame(OPCODE_CLOSE, code.to_bytes(2, "big") + reason.encode("utf-8"))


def encode_pong_frame(payload=b""):
    """Build the pong that answers a client ping, echoing its payload."""
    return encode_frame(OPCODE_PONG, payload)

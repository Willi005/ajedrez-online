"""Tests for the hand-written RFC 6455 WebSocket implementation."""

import unittest

from server.websocket import (
    OPCODE_CLOSE,
    OPCODE_PING,
    OPCODE_TEXT,
    HandshakeError,
    ProtocolError,
    build_handshake_response,
    compute_accept_key,
    decode_frame,
    encode_close_frame,
    encode_text_frame,
)

VALID_REQUEST = (
    b"GET /chess HTTP/1.1\r\n"
    b"Host: 127.0.0.1:8765\r\n"
    b"Upgrade: websocket\r\n"
    b"Connection: Upgrade\r\n"
    b"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
    b"Sec-WebSocket-Version: 13\r\n"
    b"\r\n"
)


class ComputeAcceptKeyTest(unittest.TestCase):
    def test_derives_accept_key_from_rfc6455_example(self):
        # Canonical example from RFC 6455 section 1.3.
        self.assertEqual(
            compute_accept_key("dGhlIHNhbXBsZSBub25jZQ=="),
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
        )


class BuildHandshakeResponseTest(unittest.TestCase):
    def test_returns_101_switching_protocols_with_accept_key(self):
        response = build_handshake_response(VALID_REQUEST)

        self.assertTrue(response.startswith(b"HTTP/1.1 101 Switching Protocols\r\n"))
        self.assertIn(b"Upgrade: websocket\r\n", response)
        self.assertIn(b"Connection: Upgrade\r\n", response)
        self.assertIn(b"Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n", response)
        self.assertTrue(response.endswith(b"\r\n\r\n"))

    def test_header_lookup_is_case_insensitive(self):
        request = VALID_REQUEST.replace(b"Sec-WebSocket-Key:", b"sec-websocket-key:")

        response = build_handshake_response(request)

        self.assertIn(b"Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n", response)

    def test_rejects_request_without_websocket_key(self):
        request = VALID_REQUEST.replace(
            b"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n", b""
        )

        with self.assertRaises(HandshakeError):
            build_handshake_response(request)

    def test_rejects_request_that_is_not_an_upgrade(self):
        request = VALID_REQUEST.replace(b"Upgrade: websocket\r\n", b"")

        with self.assertRaises(HandshakeError):
            build_handshake_response(request)

    def test_rejects_unsupported_websocket_version(self):
        request = VALID_REQUEST.replace(
            b"Sec-WebSocket-Version: 13", b"Sec-WebSocket-Version: 8"
        )

        with self.assertRaises(HandshakeError):
            build_handshake_response(request)


def masked_frame(payload, opcode=OPCODE_TEXT, mask=b"\x37\xfa\x21\x3d", fin=True):
    """Build a client-to-server frame the way a browser would: always masked."""
    header = bytearray()
    header.append((0x80 if fin else 0x00) | opcode)

    length = len(payload)
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header.extend(length.to_bytes(2, "big"))
    else:
        header.append(0x80 | 127)
        header.extend(length.to_bytes(8, "big"))

    header.extend(mask)
    masked = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
    return bytes(header) + masked


class DecodeFrameTest(unittest.TestCase):
    def test_decodes_rfc6455_masked_hello_example(self):
        # Canonical masked "Hello" frame from RFC 6455 section 5.7.
        raw = bytes([0x81, 0x85, 0x37, 0xFA, 0x21, 0x3D, 0x7F, 0x9F, 0x4D, 0x51, 0x58])

        frame, rest = decode_frame(raw)

        self.assertEqual(frame.opcode, OPCODE_TEXT)
        self.assertEqual(frame.payload, b"Hello")
        self.assertTrue(frame.fin)
        self.assertEqual(rest, b"")

    def test_returns_none_when_frame_is_incomplete(self):
        raw = masked_frame(b"Hello")

        frame, rest = decode_frame(raw[:6])

        self.assertIsNone(frame)
        self.assertEqual(rest, raw[:6])

    def test_returns_none_when_header_alone_is_incomplete(self):
        frame, rest = decode_frame(b"\x81")

        self.assertIsNone(frame)
        self.assertEqual(rest, b"\x81")

    def test_keeps_bytes_belonging_to_the_next_frame(self):
        first = masked_frame(b"one")
        second = masked_frame(b"two")

        frame, rest = decode_frame(first + second)

        self.assertEqual(frame.payload, b"one")
        self.assertEqual(rest, second)

    def test_decodes_extended_16_bit_payload_length(self):
        payload = b"x" * 200

        frame, rest = decode_frame(masked_frame(payload))

        self.assertEqual(frame.payload, payload)
        self.assertEqual(rest, b"")

    def test_decodes_extended_64_bit_payload_length(self):
        payload = b"y" * 70000

        frame, rest = decode_frame(masked_frame(payload))

        self.assertEqual(frame.payload, payload)
        self.assertEqual(rest, b"")

    def test_decodes_close_opcode(self):
        frame, _ = decode_frame(masked_frame(b"", opcode=OPCODE_CLOSE))

        self.assertEqual(frame.opcode, OPCODE_CLOSE)

    def test_decodes_ping_opcode(self):
        frame, _ = decode_frame(masked_frame(b"hi", opcode=OPCODE_PING))

        self.assertEqual(frame.opcode, OPCODE_PING)
        self.assertEqual(frame.payload, b"hi")

    def test_rejects_unmasked_client_frame(self):
        # RFC 6455 section 5.1: a server MUST close a connection whose client
        # frames are not masked.
        raw = bytes([0x81, 0x05]) + b"Hello"

        with self.assertRaises(ProtocolError):
            decode_frame(raw)


class EncodeFrameTest(unittest.TestCase):
    def test_encodes_short_text_frame_without_masking(self):
        encoded = encode_text_frame("Hello")

        self.assertEqual(encoded, b"\x81\x05Hello")

    def test_encodes_utf8_payload_using_byte_length(self):
        encoded = encode_text_frame("ñ")

        self.assertEqual(encoded, b"\x81\x02\xc3\xb1")

    def test_uses_16_bit_extended_length_over_125_bytes(self):
        encoded = encode_text_frame("z" * 200)

        self.assertEqual(encoded[:2], b"\x81\x7e")
        self.assertEqual(encoded[2:4], (200).to_bytes(2, "big"))
        self.assertEqual(encoded[4:], b"z" * 200)

    def test_uses_64_bit_extended_length_over_65535_bytes(self):
        encoded = encode_text_frame("z" * 70000)

        self.assertEqual(encoded[:2], b"\x81\x7f")
        self.assertEqual(encoded[2:10], (70000).to_bytes(8, "big"))

    def test_encodes_close_frame_with_status_code(self):
        encoded = encode_close_frame(1000, "bye")

        self.assertEqual(encoded[0], 0x80 | OPCODE_CLOSE)
        self.assertEqual(encoded[2:4], (1000).to_bytes(2, "big"))
        self.assertEqual(encoded[4:], b"bye")


class RoundTripTest(unittest.TestCase):
    def test_server_frame_survives_a_client_style_mask_round_trip(self):
        original = "jaque mate ♛"

        # Re-mask the server's own payload the way a browser would send it back.
        server_frame = encode_text_frame(original)
        payload = server_frame[2:] if server_frame[1] < 126 else server_frame[4:]
        frame, _ = decode_frame(masked_frame(payload))

        self.assertEqual(frame.payload.decode("utf-8"), original)


if __name__ == "__main__":
    unittest.main()

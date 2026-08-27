"""A WebSocket client built directly on a TCP socket.

The browser hides connect() behind `new WebSocket(...)`, so this client exists to
exercise the client side of the protocol explicitly: socket(), connect(),
sendall() and recv() are all visible here. It is used by the integration tests
and by the interactive console client.
"""

import base64
import json
import secrets
import socket

from server.websocket import (
    CLOSE_NORMAL,
    OPCODE_CLOSE,
    OPCODE_PING,
    OPCODE_PONG,
    OPCODE_TEXT,
    ProtocolError,
    compute_accept_key,
    decode_frame,
    encode_frame,
    parse_headers,
)

DEFAULT_TIMEOUT = 10.0
RECV_CHUNK = 4096


class ConnectionClosed(Exception):
    """Raised when the peer closed the connection while we were reading."""


class WebSocketClient:
    def __init__(self, host, port, path="/"):
        self.host = host
        self.port = port
        self.path = path
        self.connected = False
        self._socket = None
        self._buffer = b""

    def connect(self, timeout=DEFAULT_TIMEOUT):
        """Open the TCP connection and perform the WebSocket opening handshake."""
        # getaddrinfo() resolves the host and tells us which address family to
        # use, so the client works with an IPv4 literal, an IPv6 one or a name.
        candidates = socket.getaddrinfo(
            self.host, self.port, socket.AF_UNSPEC, socket.SOCK_STREAM
        )

        last_error = None
        for family, socket_type, proto, _canonname, address in candidates:
            try:
                self._socket = socket.socket(family, socket_type, proto)
                self._socket.settimeout(timeout)
                self._socket.connect(address)
                break
            except OSError as error:
                last_error = error
                if self._socket is not None:
                    self._socket.close()
                    self._socket = None
        else:
            raise ConnectionError(
                f"No se pudo conectar a {self.host}:{self.port}: {last_error}"
            )

        self._perform_handshake()
        self.connected = True
        return self

    def _perform_handshake(self):
        client_key = base64.b64encode(secrets.token_bytes(16)).decode("ascii")
        request = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {client_key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        ).encode("ascii")
        self._socket.sendall(request)

        # Read until the end of the HTTP response headers.
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = self._socket.recv(RECV_CHUNK)
            if not chunk:
                raise ConnectionClosed("El servidor cerró durante el handshake.")
            response += chunk

        head, _, remainder = response.partition(b"\r\n\r\n")
        status_line = head.split(b"\r\n", 1)[0]
        if b"101" not in status_line:
            raise ProtocolError(f"Handshake rechazado: {status_line.decode('latin-1')}")

        headers = parse_headers(head + b"\r\n\r\n")
        expected = compute_accept_key(client_key)
        if headers.get("sec-websocket-accept") != expected:
            raise ProtocolError("El servidor devolvió un Sec-WebSocket-Accept inválido.")

        # Bytes after the header block already belong to the frame stream.
        self._buffer = remainder

    def send_text(self, text):
        """Send a text frame. Client frames are always masked."""
        self._socket.sendall(encode_frame(OPCODE_TEXT, text.encode("utf-8"), mask=True))

    def send_json(self, payload):
        self.send_text(json.dumps(payload))

    def receive_text(self, timeout=DEFAULT_TIMEOUT):
        """Block until one complete text frame arrives, then return its payload."""
        if timeout is not None:
            self._socket.settimeout(timeout)

        while True:
            frame, rest = decode_frame(self._buffer, expect_mask=False)
            if frame is not None:
                self._buffer = rest

                if frame.opcode == OPCODE_TEXT:
                    return frame.payload.decode("utf-8")
                if frame.opcode == OPCODE_PING:
                    self._socket.sendall(
                        encode_frame(OPCODE_PONG, frame.payload, mask=True)
                    )
                    continue
                if frame.opcode == OPCODE_CLOSE:
                    self.connected = False
                    raise ConnectionClosed("El servidor cerró la conexión.")
                continue

            chunk = self._socket.recv(RECV_CHUNK)
            if not chunk:
                self.connected = False
                raise ConnectionClosed("El servidor cerró la conexión.")
            self._buffer += chunk

    def receive_json(self, timeout=DEFAULT_TIMEOUT):
        return json.loads(self.receive_text(timeout=timeout))

    def close(self, code=CLOSE_NORMAL):
        """Send a close frame, then shut down and release the socket."""
        if self._socket is None:
            return

        try:
            self._socket.sendall(
                encode_frame(OPCODE_CLOSE, code.to_bytes(2, "big"), mask=True)
            )
            self._socket.shutdown(socket.SHUT_WR)
        except OSError:
            pass
        finally:
            self._socket.close()
            self._socket = None
            self.connected = False

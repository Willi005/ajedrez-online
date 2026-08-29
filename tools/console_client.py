"""Interactive console client for the chess server.

Useful for two things: driving the server without a browser during development,
and demonstrating the raw socket client side of the protocol, where connect(),
sendall() and recv() are visible instead of hidden behind a browser API.

    python3 -m tools.console_client --host 127.0.0.1 --port 8765

Commands:
    create <apodo>        abre una sala y muestra el token
    join <token> <apodo>  se une a una sala existente
    move <desde> <hasta>  envía una jugada, por ejemplo: move e2 e4
    chat <texto>          envía un mensaje al rival
    resign                se rinde
    quit                  cierra la conexión y sale
"""

import argparse
import threading

from tools.ws_client import ConnectionClosed, WebSocketClient

HELP = __doc__.split("Commands:")[1].strip()


def render(message):
    """Turn one server message into a readable console line."""
    kind = message.get("type")

    if kind == "created":
        return f"[sala]   Token: {message['token']}  ·  juegas con {message['color']}"
    if kind == "start":
        return (
            f"[inicio] Partida comenzada contra '{message['opponent']}'  ·  "
            f"juegas con {message['color']}"
        )
    if kind == "move":
        promotion = f" (promueve a {message['promotion']})" if message.get("promotion") else ""
        return f"[rival]  Jugada {message['from']} -> {message['to']}{promotion}"
    if kind == "chat":
        return f"[chat]   {message['from']}: {message['text']}"
    if kind == "game_over":
        return f"[fin]    Partida terminada ({message['reason']}). Ganan las {message['winner']}."
    if kind == "opponent_left":
        return "[aviso]  El rival abandonó la partida."
    if kind == "error":
        return f"[error]  {message['code']}: {message['message']}"
    return f"[?]      {message}"


def listen(client, stop_event):
    """Background thread: print everything the server sends."""
    while not stop_event.is_set():
        try:
            message = client.receive_json(timeout=1.0)
        except TimeoutError:
            continue
        except ConnectionClosed:
            print("\n[aviso]  El servidor cerró la conexión.")
            stop_event.set()
            return
        except OSError:
            stop_event.set()
            return
        print(f"\n{render(message)}\n> ", end="", flush=True)


def build_message(line):
    """Translate a console command into a protocol message, or None if invalid."""
    parts = line.split()
    command = parts[0].lower()

    if command == "create" and len(parts) == 2:
        return {"type": "create", "nickname": parts[1]}
    if command == "join" and len(parts) == 3:
        return {"type": "join", "token": parts[1], "nickname": parts[2]}
    if command == "move" and len(parts) >= 3:
        message = {"type": "move", "from": parts[1], "to": parts[2], "fen": "console"}
        if len(parts) > 3:
            message["promotion"] = parts[3]
        return message
    if command == "chat" and len(parts) >= 2:
        return {"type": "chat", "text": " ".join(parts[1:])}
    if command == "resign":
        return {"type": "resign"}
    return None


def main():
    parser = argparse.ArgumentParser(description="Cliente de consola del ajedrez online.")
    parser.add_argument("--host", default="127.0.0.1", help="IP del servidor")
    parser.add_argument("--port", type=int, default=8765, help="Puerto del servidor")
    args = parser.parse_args()

    client = WebSocketClient(args.host, args.port)
    print(f"Conectando a {args.host}:{args.port} ...")
    try:
        client.connect()
    except (ConnectionError, OSError) as error:
        print(f"No se pudo conectar: {error}")
        return 1

    print("Conectado. Escribe 'help' para ver los comandos.\n")

    stop_event = threading.Event()
    listener = threading.Thread(target=listen, args=(client, stop_event), daemon=True)
    listener.start()

    try:
        while not stop_event.is_set():
            line = input("> ").strip()
            if not line:
                continue
            if line.lower() in {"quit", "exit"}:
                break
            if line.lower() == "help":
                print(HELP)
                continue

            message = build_message(line)
            if message is None:
                print("Comando no reconocido. Escribe 'help'.")
                continue
            client.send_json(message)
    except (KeyboardInterrupt, EOFError):
        print()
    finally:
        stop_event.set()
        client.close()
        print("Conexión cerrada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

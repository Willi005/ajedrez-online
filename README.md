# Ajedrez Online

Frontend-only online chess web application.

Two-player chess over a raw TCP socket, with an in-game chat. Games are paired
with a short token — no accounts, no database, nothing persisted.

## Tech Stack

**Client** — [React](https://react.dev/) (JavaScript) + [Vite](https://vite.dev/),
with `chess.js` for the game rules. No REST API, no database.

**Server** — Python 3.10+, standard library only. The RFC 6455 WebSocket
handshake and frame codec are implemented by hand on top of a plain
`SOCK_STREAM` socket, so every socket call stays explicit.

## Running the Server

No installation required. From the repository root:

```bash
# Listen on every interface (use this to play across a LAN)
python3 -m server.server --port 8765

# Listen on localhost only
python3 -m server.server --host 127.0.0.1 --port 8765
```

Default address is `0.0.0.0:8765`.

## Running the Client

```bash
npm install
npm run dev
```

A console client is also available, useful for driving the server without a
browser:

```bash
python3 -m tools.console_client --host 127.0.0.1 --port 8765
```

Commands: `create <nick>`, `join <token> <nick>`, `move <from> <to>`,
`chat <text>`, `resign`, `quit`.

## Tests

```bash
python3 -m unittest discover -s server/tests -t .
```

## Scripts

- `npm run dev` — start the development server
- `npm run build` — build for production
- `npm run lint` — run Oxlint
- `npm run preview` — preview the production build locally

## Documentation

`docs/bitacora-desarrollo.md` — development log and handoff document: design
decisions, the full message protocol contract, and instructions for the next
work block.

## Branching Model (Gitflow)

- `main` — stable, production-ready code
- `dev` — integration branch for ongoing development
- `feature/*`, `fix/*`, etc. — branched off `dev`

Commits follow the [Conventional Commits](https://www.conventionalcommits.org/) style (`feat:`, `fix:`, `chore:`, ...).

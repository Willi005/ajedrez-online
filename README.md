# Ajedrez Online

Two-player online chess over a raw TCP socket, with an in-game chat. Games are
paired with a short token — no accounts, no database, nothing persisted.

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

The client connects to the address in `VITE_SERVER_URL`. Copy `.env.example` to
`.env` to change it for the build; it can also be edited from the interface at
run time, which is the fallback when the network keeps the two machines apart.

A console client is also available, useful for driving the server without a
browser:

```bash
python3 -m tools.console_client --host 127.0.0.1 --port 8765
```

Commands: `create <nick>`, `join <token> <nick>`, `move <from> <to>`,
`chat <text>`, `resign`, `quit`.

## Playing on One Machine

Open two browser windows on `http://localhost:5173`. Use a **private/incognito
window for the second one**: the nickname lives in `localStorage`, which is
scoped per origin and not per tab, so two normal tabs share the same nickname.

## Playing Across Two Machines

Only the host installs anything. The other player just opens a browser.

```
   HOST                                          GUEST
   ────                                          ─────
   python server  :8765  ◄──── WebSocket ────────┐
   vite --host    :5173  ◄──── HTTP ─────────────┤
   browser (white)                          browser (black)
                                 http://<HOST_IP>:5173
```

**1. Find the host's LAN address**

```bash
ip -4 addr show scope global | grep -oP 'inet \K[\d.]+'
```

**2. Point the client at it** — put that address in `.env` (create it from
`.env.example` if needed). The port stays 8765:

```
VITE_SERVER_URL=ws://192.168.1.42:8765
```

**3. Open the firewall.** Both ports must accept inbound TCP. On `ufw`:

```bash
sudo ufw allow 8765/tcp comment 'ajedrez servidor'
sudo ufw allow 5173/tcp comment 'ajedrez vite'
sudo ufw status numbered
```

Run the two `allow` lines **separately**, not chained with `&&`. When a rule
already exists `ufw` prints `Skipping adding existing rule` and exits non-zero,
which silently aborts the rest of an `&&` chain.

The rules are permanent and independent of the IP, so this is a one-time step
even when the network changes.

**4. Start both services** — note the `--host`, without it Vite binds to
localhost only and the guest cannot reach it:

```bash
python3 -m server.server --port 8765
npm run dev -- --host
```

**5. The guest opens `http://<HOST_IP>:5173`** — with the port. Each player
enters a nickname; the host creates a game and shares the 5-character token.
Two different machines mean two separate `localStorage`, so no incognito window
is needed here.

### When the guest cannot connect

Work down the list; each step rules out one layer.

| Symptom | Meaning | Fix |
|---|---|---|
| `ping <HOST_IP>` fails | The machines cannot see each other. Some networks isolate clients. | Use a phone hotspot instead. |
| `ping` works, page does not load | ICMP passes but TCP is dropped — almost always the firewall. | Step 3 above. |
| Page loads, status shows disconnected | HTTP reaches Vite but the WebSocket does not. | Stale IP in `.env`; or override it in the UI under **Servidor**, which accepts the short `192.168.1.42:8765` form. |

The decisive evidence is the host's kernel log, which records every dropped
packet with its source, destination port and timestamp:

```bash
journalctl -k --since "-10min" | grep "UFW BLOCK"
```

An entry with `DPT=5173` means the firewall is still blocking. No entries while
the guest is retrying means the packets are getting through and the problem is
elsewhere. Note that `DPT=80` entries mean the guest omitted the `:5173` port.

## Tests

```bash
python3 -m unittest discover -s server/tests -t .
```

## Scripts

- `npm run dev` — start the development server
- `npm run build` — build for production
- `npm run lint` — run Oxlint
- `npm run preview` — preview the production build locally

## Project Status

| Block | Scope | Status |
|---|---|---|
| 1. Server | TCP sockets, hand-written WebSocket, token rooms, validation, console client | Done |
| 2. React client | Connection, nickname, lobby, board with `chess.js`, move sync | Done |
| 3. Chat and polish | Chat, resign, game-over screen, error UI, minimal styling | Done |

## Documentation

`docs/bitacora-desarrollo.md` — development log and handoff document: design
decisions, the full message protocol contract, the socket methods used and
where, and the instructions for the next work block.

## Branching Model (Gitflow)

- `main` — stable, production-ready code
- `dev` — integration branch for ongoing development
- `feature/*`, `fix/*`, etc. — branched off `dev`

Commits follow the [Conventional Commits](https://www.conventionalcommits.org/) style (`feat:`, `fix:`, `chore:`, ...).

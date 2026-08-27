# Bitácora de desarrollo — ajedrez-online

Documento técnico de traspaso entre bloques de trabajo. Registra qué se
construyó, por qué se decidió así, y qué contrato debe respetar quien tome el
bloque siguiente.

- **Repositorio:** https://github.com/Willi005/ajedrez-online
- **Estado actual:** Bloque 1 terminado (servidor). Bloques 2 y 3 pendientes.
- **Última actualización:** 27 de agosto de 2026

---

## 1. Cómo está dividido el trabajo

| Bloque | Alcance | Estado |
|---|---|---|
| **1. Servidor** | Sockets TCP, WebSocket a mano, salas por token, validaciones, cliente de consola | ✅ Terminado |
| **2. Cliente React** | Conexión, apodo, lobby, tablero con `chess.js`, sincronización de jugadas | ⬜ Pendiente |
| **3. Chat y estética** | Chat, fin de partida, UI de errores, diseño minimal | ⬜ Pendiente |

Los diagramas, la tabla de pruebas del informe y todo el material teórico
quedan **fuera** de estos bloques: se elaboran al final, con la aplicación ya
terminada.

---

## 2. Decisiones de diseño tomadas

Estas cinco decisiones condicionan todo lo demás. Se registran con las
alternativas que se descartaron, porque esa justificación se necesita después.

### 2.1. Servidor de sockets crudos en Python, no "cero backend"

**Tensión detectada:** el proyecto se planteó como aplicación web sin backend,
pero el taller exige un componente servidor con dirección IP y puerto
explícitos, y documentar métodos como `bind()`, `listen()` y `accept()`. Un
navegador no puede abrir sockets TCP o UDP crudos: solo HTTP y WebSocket. Ambas
condiciones no podían cumplirse a la vez.

**Resolución:** se mantiene el "sin backend" en el sentido que importaba —sin
API REST, sin base de datos, sin cuentas de usuario— y se agrega un proceso
servidor que habla únicamente el protocolo de sockets. El servidor no sirve
páginas ni expone endpoints HTTP.

**Alternativas descartadas:**

- *Servidor en Node.js con el módulo `net`.* Node es orientado a eventos y no
  expone `bind`, `listen` ni `accept` como métodos separados: todo se resuelve
  con `server.listen()` más un evento `connection`. Varios de los métodos que
  el taller exige habrían quedado como teoría sin uso real.
- *Cliente de terminal en lugar de web.* Cumplía el enunciado de forma directa,
  pero el ajedrez online con chat dejaba de ser la entrega.

### 2.2. WebSocket implementado a mano sobre TCP

El servidor abre un `socket(AF_INET, SOCK_STREAM)` normal e implementa por sí
mismo el handshake de apertura y el enmarcado de RFC 6455. No se usa ninguna
biblioteca de WebSocket.

**Por qué:** es la única forma de que el navegador se conecte directamente
manteniendo visibles todas las llamadas de socket. Una biblioteca como
`websockets` habría ocultado exactamente lo que el taller quiere ver.

**Consecuencia:** el servidor no tiene dependencias de terceros. Solo
biblioteca estándar de Python.

### 2.3. Las reglas de ajedrez viven en el cliente

El servidor valida red y sesión: forma del mensaje, tipos de campo, rangos,
pertenencia a la sala y propiedad del turno. **No** sabe si un alfil se mueve en
diagonal. La legalidad completa de las jugadas —jaque, mate, ahogado, enroque,
al paso, promoción— la resuelve `chess.js` en el navegador.

**Por qué:** implementar un motor de ajedrez dos veces habría consumido el
tiempo disponible sin aportar nada a la parte de redes, que es lo que el taller
evalúa. La división es explícita y defendible: *validación de red en el
servidor, validación de dominio en el cliente*.

**Límite conocido:** un cliente modificado podría enviar una jugada ilegal en
formato correcto y el servidor la retransmitiría. Es una decisión consciente,
no un descuido.

### 2.4. Emparejamiento por token compartido manualmente

Un jugador crea la partida, el servidor le entrega un token de 5 caracteres, y
ese jugador se lo pasa a su rival por fuera de la aplicación.

**Por qué:** da control total sobre cuándo se conectan los dos jugadores, lo
que es una ventaja para demostrar el programa en clases. Una cola automática
habría obligado a coordinar que dos personas pulsen un botón casi al mismo
tiempo.

**Detalle del alfabeto de tokens:** se excluyen `I`, `L`, `O`, `0` y `1` para
que un token pueda leerse en voz alta o anotarse sin ambigüedad. El alfabeto
resultante es `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 caracteres, 31⁵ ≈ 28,6
millones de combinaciones).

### 2.5. Un hilo por cliente

El hilo principal ejecuta `accept()` en bucle y entrega cada conexión aceptada a
un hilo dedicado que hace `recv()` para ese cliente. El estado compartido está
en un único `RoomRegistry` protegido por un `threading.RLock`.

**Alternativas descartadas:** `select()` habría evitado los bloqueos pero con un
flujo menos intuitivo de explicar; `asyncio` habría abstraído los sockets
justamente donde se los quiere explícitos.

---

## 3. Arquitectura

```
┌─────────────────────────┐         ┌──────────────────────────────────┐
│  NAVEGADOR (Bloque 2/3) │         │      SERVIDOR (Bloque 1) ✅      │
│                         │         │                                  │
│  React + Vite           │         │  Python 3, solo stdlib           │
│  chess.js (reglas)      │         │                                  │
│  new WebSocket(...)     │──TCP───▶│  socket(AF_INET, SOCK_STREAM)    │
│                         │         │  setsockopt(SO_REUSEADDR)        │
│  localStorage: apodo    │         │  bind((host, port))              │
└─────────────────────────┘         │  listen(16)                      │
                                    │  accept()  ─┐                    │
┌─────────────────────────┐         │             │ hilo por cliente   │
│ CLIENTE CONSOLA ✅      │         │             ▼                    │
│ tools/console_client.py │──TCP───▶│  handshake RFC 6455              │
│ socket() + connect()    │         │  recv() → decode_frame()         │
└─────────────────────────┘         │  validate_client_message()       │
                                    │  RoomRegistry [RLock]            │
                                    │  encode_text_frame() → sendall() │
                                    │  shutdown() → close()            │
                                    └──────────────────────────────────┘
```

### Archivos del bloque 1

| Archivo | Responsabilidad |
|---|---|
| `server/websocket.py` | Handshake RFC 6455 y codec de tramas. Sin estado. |
| `server/protocol.py` | Validación por capas de mensajes de cliente. Sin estado. |
| `server/rooms.py` | Salas, tokens, turnos. Todo el estado compartido, con lock. |
| `server/server.py` | Socket TCP, bucle `accept()`, hilos, despacho de mensajes. |
| `tools/ws_client.py` | Cliente WebSocket sobre socket crudo. Reutilizable. |
| `tools/console_client.py` | Cliente interactivo de terminal. |

La dependencia es en una sola dirección: `server.py` → `rooms.py` → `protocol.py`,
y `server.py` → `websocket.py`. No hay ciclos.

---

## 4. Contrato del protocolo

**Este es el contrato que el bloque 2 debe implementar.** Transporte: tramas de
texto WebSocket, cada una con un objeto JSON. Codificación UTF-8. Máximo 4096
bytes por trama.

### 4.1. Cliente → servidor

| `type` | Campos | Notas |
|---|---|---|
| `create` | `nickname` | Abre una sala. El creador juega con blancas. |
| `join` | `token`, `nickname` | El token se acepta en minúsculas y se normaliza a mayúsculas. |
| `move` | `from`, `to`, `fen`, `promotion` (opcional) | `promotion` es `null` o una de `q`, `r`, `b`, `n`. |
| `chat` | `text` | 1 a 200 caracteres tras limpiar caracteres de control. |
| `resign` | — | Sin campos adicionales. |

```json
{"type": "create", "nickname": "ana"}
{"type": "join",   "token": "7QK2P", "nickname": "beto"}
{"type": "move",   "from": "e2", "to": "e4", "promotion": null, "fen": "rnbq..."}
{"type": "chat",   "text": "buena jugada"}
{"type": "resign"}
```

### 4.2. Servidor → cliente

| `type` | Campos | Cuándo |
|---|---|---|
| `created` | `token`, `color` | Respuesta a `create`. `color` siempre `"white"`. |
| `start` | `token`, `color`, `nickname`, `opponent` | A **ambos** jugadores cuando el segundo se une. |
| `move` | `from`, `to`, `promotion`, `fen` | Retransmisión al rival. Idéntico al que envió el otro. |
| `chat` | `from`, `text` | `from` es el apodo del emisor. |
| `game_over` | `reason`, `winner` | `reason` es `"resign"`. `winner` es `"white"` o `"black"`. |
| `opponent_left` | — | El rival cerró la conexión o se cayó. |
| `error` | `code`, `message` | Ante cualquier rechazo. `message` está en español. |

```json
{"type": "created",       "token": "7QK2P", "color": "white"}
{"type": "start",         "token": "7QK2P", "color": "black", "nickname": "beto", "opponent": "ana"}
{"type": "move",          "from": "e2", "to": "e4", "promotion": null, "fen": "rnbq..."}
{"type": "chat",          "from": "ana", "text": "buena jugada"}
{"type": "game_over",     "reason": "resign", "winner": "black"}
{"type": "opponent_left"}
{"type": "error",         "code": "NOT_YOUR_TURN", "message": "No es tu turno."}
```

### 4.3. Códigos de error

El `code` es estable y está pensado para que el cliente reaccione según la
causa, sin tener que interpretar el texto.

| Código | Significado |
|---|---|
| `BAD_JSON` | El mensaje no es JSON, o no es un objeto. |
| `BAD_ENCODING` | La trama no es UTF-8 válido. |
| `MISSING_TYPE` | Falta el campo `type`. |
| `UNKNOWN_TYPE` | El `type` no está en la lista blanca. |
| `INVALID_NICKNAME` | Apodo vacío, de más de 16 caracteres, o con caracteres de control. |
| `INVALID_TOKEN_FORMAT` | El token no tiene 5 caracteres del alfabeto permitido. |
| `INVALID_SQUARE` | `from` o `to` no coinciden con `^[a-h][1-8]$`. |
| `INVALID_PROMOTION` | La pieza de promoción no es `q`, `r`, `b` ni `n`. |
| `INVALID_FEN` | Falta el FEN o excede 100 caracteres. |
| `INVALID_CHAT` | Mensaje vacío o de más de 200 caracteres. |
| `ROOM_NOT_FOUND` | El token no corresponde a ninguna sala. |
| `ROOM_FULL` | La sala ya tiene dos jugadores. |
| `ALREADY_IN_ROOM` | Esa conexión ya está en una partida. |
| `NOT_IN_ROOM` | La conexión intentó jugar o chatear sin estar en una sala. |
| `GAME_NOT_STARTED` | Se intentó mover antes de que llegara el rival. |
| `NOT_YOUR_TURN` | Un jugador intentó mover en el turno del otro. |

### 4.4. Secuencia completa

```
Jugador A (blancas)          SERVIDOR                Jugador B (negras)
        │                        │                          │
        │──── handshake ────────▶│                          │
        │◀─── 101 Switching ─────│                          │
        │                        │                          │
        │──── create ───────────▶│                          │
        │◀─── created 7QK2P ─────│                          │
        │                        │◀──── handshake ──────────│
        │                        │───── 101 Switching ─────▶│
        │                        │◀──── join 7QK2P ─────────│
        │◀─── start ─────────────│───── start ─────────────▶│
        │                        │                          │
        │──── move e2e4 ────────▶│───── move e2e4 ─────────▶│
        │                        │◀──── move e7e5 ──────────│
        │◀─── move e7e5 ─────────│                          │
        │                        │                          │
        │──── chat "hola" ──────▶│───── chat ana:"hola" ───▶│
        │                        │                          │
        │                        │◀──── resign ─────────────│
        │◀─── game_over ─────────│───── game_over ─────────▶│
        │                        │                          │
        │──── close frame ──────▶│                          │
        │                        │───── opponent_left ─────▶│
```

---

## 5. Capas de validación

Cada mensaje entrante atraviesa estas capas en orden. La primera que falla
detiene el proceso y devuelve un `error` con su código.

| # | Capa | Dónde | Qué rechaza |
|---|---|---|---|
| 1 | Trama | `websocket.decode_frame` | Trama de cliente sin enmascarar; carga mayor a 4 KB. |
| 2 | Codificación | `server._read_loop` | Carga que no decodifica como UTF-8. |
| 3 | JSON | `protocol.validate_client_message` | Texto no parseable, o JSON que no es objeto. |
| 4 | Tipo | idem | `type` ausente o fuera de la lista blanca. |
| 5 | Esquema | idem | Campos faltantes o del tipo equivocado. |
| 6 | Rango | idem | Apodo, token, casilla, promoción, FEN o chat fuera de rango. |
| 7 | Sesión | `rooms.RoomRegistry` | Sala inexistente o llena; no estar en sala; no ser el turno. |

Un mensaje rechazado **no cierra la conexión**: el cliente recibe el error y
puede seguir jugando. Solo una violación del protocolo WebSocket en sí (capa 1)
provoca un cierre.

---

## 6. Métodos de socket utilizados

Se registran aquí con su ubicación exacta para no tener que buscarlos después.

| Método | Archivo | Para qué |
|---|---|---|
| `socket()` | `server.py:ChessServer.bind` | Crear el socket de escucha TCP/IPv4. |
| `setsockopt()` | `server.py:ChessServer.bind` | `SO_REUSEADDR`, para reiniciar sin esperar `TIME_WAIT`. |
| `bind()` | `server.py:ChessServer.bind` | Asociar la IP y el puerto. |
| `listen()` | `server.py:ChessServer.bind` | Poner el socket en escucha, backlog 16. |
| `getsockname()` | `server.py:ChessServer.bind` | Consultar el puerto real cuando se pide el 0. |
| `settimeout()` | `server.py:bind`, `_handle_client` | Evitar bloqueos indefinidos en `accept()` y `recv()`. |
| `accept()` | `server.py:ChessServer.serve_forever` | Aceptar conexiones en el hilo principal. |
| `recv()` | `server.py:_handshake`, `_read_loop` | Leer bytes del cliente. |
| `sendall()` | `server.py:_send_raw`, `_handshake` | Enviar la respuesta y las tramas, completas. |
| `shutdown()` | `server.py:_cleanup` | Cierre ordenado antes de liberar. |
| `close()` | `server.py:_cleanup`, `stop` | Liberar el descriptor. |
| `connect()` | `tools/ws_client.py:connect` | **Lado cliente.** Conectar al servidor. |
| `getaddrinfo()` | `tools/ws_client.py:connect` | Resolver el destino y elegir familia de direcciones. |

`connect()` y `getaddrinfo()` están en el cliente de consola porque el navegador
los esconde tras `new WebSocket(...)`. Esa fue una razón explícita para
construir `tools/console_client.py`.

---

## 7. Cómo ejecutar y probar

Todo se ejecuta **desde la raíz del repositorio**. El servidor no necesita
instalar nada: solo Python 3.10 o superior.

```bash
# Servidor, escuchando en todas las interfaces
python3 -m server.server --port 8765

# Solo en local
python3 -m server.server --host 127.0.0.1 --port 8765

# Cliente de consola, en otra terminal
python3 -m tools.console_client --host 127.0.0.1 --port 8765

# Pruebas (89 en total)
python3 -m unittest discover -s server/tests -t .
```

Comandos del cliente de consola: `create <apodo>`, `join <token> <apodo>`,
`move <desde> <hasta>`, `chat <texto>`, `resign`, `quit`, `help`.

### Verificación ya realizada

Las 89 pruebas pasan, de las cuales 17 son de integración: levantan un servidor
real en un puerto efímero y se conectan con sockets reales, sin nada simulado.

Además se verificó a mano contra el proceso servidor real: creación de sala,
unión con token en minúsculas, jugadas alternadas, chat con caracteres UTF-8
(`♞`), rechazo por turno incorrecto, rechazo de chat vacío, rendición y cierre
de sockets. La salida del servidor registra cada uno de esos pasos.

---

## 8. Instrucciones para el bloque 2 (cliente React)

El proyecto Vite + React ya está inicializado en la raíz (`src/`, `index.html`,
`vite.config.js`). Falta todo el código de la aplicación.

**Por construir:**

1. `src/hooks/useGameSocket.js` — conexión WebSocket contra la URL configurable,
   envío y recepción de los mensajes de la sección 4, reconexión ante caída.
2. Vista de apodo — pide el apodo y lo guarda en `localStorage`.
3. Vista de lobby — botón "Crear partida" que muestra el token, y campo para
   unirse con un token.
4. `src/components/Board` — tablero en CSS Grid con `chess.js` para las reglas.
5. Sincronización — al mover, validar con `chess.js`, enviar `move` con el FEN
   resultante, y aplicar los `move` que llegan del rival.

**Restricciones que hay que respetar:**

- La URL del servidor sale de una variable de entorno de Vite y debe poder
  editarse desde la interfaz. Esto es el plan de respaldo para la demostración:
  si la red de la sala aísla a los clientes, se cambia a `127.0.0.1` y se corre
  todo en un equipo.
- No agregar backend, API REST ni base de datos.
- Código y nombres en inglés. Los textos visibles al usuario, en español.
- El servidor ya rechaza las jugadas fuera de turno, pero el cliente **también**
  debe impedirlas en la interfaz, para no depender del viaje de ida y vuelta.

**Cómo probar sin tocar el servidor:** levantar `python3 -m server.server` y
abrir dos pestañas del navegador. El cliente de consola sirve para simular al
rival mientras se desarrolla una sola pestaña.

**Fuera de alcance del bloque 2:** chat, pantalla de fin de partida y estética.
Eso es el bloque 3.

---

## 9. Registro cronológico

### 27 de agosto de 2026 — Bloque 1

- Se detectó y resolvió la contradicción entre "sin backend" y el requisito de
  un componente servidor (sección 2.1).
- Se implementó con TDD, en este orden: clave de aceptación del handshake →
  handshake completo → codec de tramas → validación de protocolo → salas y
  turnos → servidor y cliente. Cada paso se verificó en rojo antes de
  implementar.
- Se usó `unittest` de la biblioteca estándar en lugar de `pytest`, que no
  estaba instalado. Ventaja lateral: el proyecto queda sin dependencias.
- **Problema encontrado:** el enmascarado de tramas es asimétrico —el cliente
  siempre enmascara, el servidor nunca—, y la primera versión del codec solo
  contemplaba la dirección cliente→servidor. Se refactorizó `decode_frame` y
  `encode_frame` con los parámetros `expect_mask` y `mask` para cubrir ambas
  direcciones con un solo codec.
- **Problema encontrado:** archivos `__pycache__` quedaron versionados porque el
  `.gitignore` era el de Vite y no contemplaba Python. Al corregirlo, un
  `git commit -- <ruta>` no los quitó del índice, porque esa forma commitea el
  árbol de trabajo ignorando el índice. Se resolvió con `git rm -r --cached`
  seguido de un commit sin especificar rutas.

---

## 10. Convenciones del repositorio

- **Ramas:** Gitflow. `main` estable, `dev` de integración, `feature/*` para cada
  bloque. El bloque 1 se desarrolló en `feature/socket-server`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`,
  `test:`), en inglés.
- **Código:** en inglés, incluidos nombres y comentarios.
- **Textos de usuario y documentación:** en español.

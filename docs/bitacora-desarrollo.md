# Bitácora de desarrollo — ajedrez-online

Documento técnico de traspaso entre bloques de trabajo. Registra qué se
construyó, por qué se decidió así, y qué contrato debe respetar quien tome el
bloque siguiente.

- **Repositorio:** https://github.com/Willi005/ajedrez-online
- **Estado actual:** Bloques 1 y 2 terminados (servidor y cliente React).
  Bloque 3 pendiente.
- **Última actualización:** 27 de agosto de 2026

---

## 1. Cómo está dividido el trabajo

| Bloque | Alcance | Estado |
|---|---|---|
| **1. Servidor** | Sockets TCP, WebSocket a mano, salas por token, validaciones, cliente de consola | ✅ Terminado |
| **2. Cliente React** | Conexión, apodo, lobby, tablero con `chess.js`, sincronización de jugadas | ✅ Terminado |
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
│  NAVEGADOR (Bloque 2) ✅│         │      SERVIDOR (Bloque 1) ✅      │
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

### Archivos del bloque 2

| Archivo | Responsabilidad |
|---|---|
| `src/lib/protocol.js` | Construye los mensajes de cliente y normaliza token y apodo igual que el servidor. Sin estado. |
| `src/lib/config.js` | Resuelve la dirección del servidor: variable de entorno más el ajuste que el usuario guarda. |
| `src/lib/storage.js` | `localStorage` con cada acceso protegido. |
| `src/lib/pieces.js` | Nombres de las piezas en español, para etiquetas accesibles y para la interfaz. |
| `src/hooks/useGameSocket.js` | La conexión: abre, reconecta con espera creciente, envía, notifica. |
| `src/hooks/useChessGame.js` | Una instancia de `chess.js` y una foto inmutable de la posición para React. |
| `src/components/Board.jsx` | Tablero en CSS Grid, volteado para las negras. Solo presentación. |
| `src/components/Piece.jsx` | Las seis piezas dibujadas en SVG. |
| `src/components/NicknameForm.jsx` | Primera vista: pide el apodo. |
| `src/components/Lobby.jsx` | Crear partida o unirse con un token. |
| `src/components/WaitingRoom.jsx` | Muestra el token mientras no llega el rival. |
| `src/components/GameScreen.jsx` | La partida: turno, selección de casillas, promoción. |
| `src/components/PromotionPicker.jsx` | Pregunta la pieza antes de enviar la jugada. |
| `src/components/ServerSettings.jsx` | Estado de la conexión y edición de la dirección del servidor. |
| `src/App.jsx` | Estado de sesión (apodo, sala, fase) y unión entre el socket y el motor. |

La dependencia también va en una sola dirección: `App.jsx` → hooks → `lib/`, y
`App.jsx` → componentes → `lib/`. Ningún componente abre el socket por su
cuenta: todos los mensajes salen y entran por `App.jsx`.

---

## 4. Contrato del protocolo

**Este es el contrato, ya implementado en los dos extremos.** El servidor lo
valida en `server/protocol.py`; el cliente lo construye en `src/lib/protocol.js`.
Transporte: tramas de texto WebSocket, cada una con un objeto JSON. Codificación
UTF-8. Máximo 4096 bytes por trama.

El bloque 2 dejó implementados `create`, `join` y `move`, y el manejo de
`created`, `start`, `move`, `game_over`, `opponent_left` y `error`. Quedan sin
usar `chat` y `resign`, que son del bloque 3; sus constructores ya existen en
`src/lib/protocol.js`.

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
# Terminal 1 — servidor, escuchando en todas las interfaces
python3 -m server.server --port 8765

# Solo en local
python3 -m server.server --host 127.0.0.1 --port 8765

# Terminal 2 — cliente web
npm install
npm run dev

# Terminal 3 (opcional) — cliente de consola, para simular al rival
python3 -m tools.console_client --host 127.0.0.1 --port 8765

# Pruebas del servidor (89 en total)
python3 -m unittest discover -s server/tests -t .

# Linter y compilación del cliente
npm run lint
npm run build
```

Comandos del cliente de consola: `create <apodo>`, `join <token> <apodo>`,
`move <desde> <hasta>`, `chat <texto>`, `resign`, `quit`, `help`.

La dirección a la que se conecta el cliente sale de `VITE_SERVER_URL`. Se copia
`.env.example` a `.env` para fijarla en la compilación, y además se puede editar
desde la propia interfaz, en el desplegable "Servidor" al pie de la página.

**Para probar con dos jugadores en un mismo equipo:** dos pestañas del mismo
navegador comparten `localStorage`, así que las dos verían el mismo apodo. Hay
que usar dos navegadores distintos, o una ventana normal más una de incógnito.

### Verificación ya realizada

**Servidor (bloque 1).** Las 89 pruebas pasan, de las cuales 17 son de
integración: levantan un servidor real en un puerto efímero y se conectan con
sockets reales, sin nada simulado. Siguen pasando después del bloque 2, que no
tocó ningún archivo del servidor.

Además se verificó a mano contra el proceso servidor real: creación de sala,
unión con token en minúsculas, jugadas alternadas, chat con caracteres UTF-8
(`♞`), rechazo por turno incorrecto, rechazo de chat vacío, rendición y cierre
de sockets. La salida del servidor registra cada uno de esos pasos.

**Cliente (bloque 2).** Se verificó contra el servidor real, no simulado, en dos
niveles:

- *Protocolo.* Un guion de Node usa los mismos constructores de
  `src/lib/protocol.js` para jugar una apertura completa contra el servidor y
  comprobar los rechazos: `NOT_YOUR_TURN`, `ALREADY_IN_ROOM`, `ROOM_NOT_FOUND`,
  `INVALID_TOKEN_FORMAT` y `opponent_left`. Los FEN reales miden entre 56 y 67
  caracteres, holgados frente al límite de 100.
- *Navegador.* Dos pestañas en contextos separados jugaron una partida completa
  contra el servidor: apodo persistido y recuperado tras recargar, creación de
  sala, unión con el token en minúsculas, orientación del tablero por color,
  bloqueo de la interfaz fuera de turno, seis jugadas alternadas, enroque, al
  paso, promoción con elección de pieza, aviso de rival desconectado y cambio de
  la dirección del servidor en caliente.

---

## 8. Instrucciones para el bloque 3 (chat y estética)

El cliente ya juega. Lo que falta es lo que rodea a la partida: hablar con el
rival, cerrarla, avisar cuando algo se rechaza, y que todo eso se vea bien.

**Por construir:**

1. **Chat.** Enviar `chat` y mostrar los `chat` que llegan. El constructor
   `chatMessage(text)` ya existe en `src/lib/protocol.js`; falta la vista y
   guardar el historial. El punto de enganche está en el `switch` de
   `handleMessage` en `src/App.jsx`: hoy el caso `chat` cae en el `default` con
   un comentario que lo dice.
2. **Pantalla de fin de partida.** El estado `outcome` de `src/App.jsx` ya
   guarda `{ reason, winner }` y se llena con `game_over` y con
   `opponent_left`. Hoy lo pinta un panel de reemplazo marcado con un
   comentario; hay que sustituirlo.
3. **Rendición.** Falta el botón. `resignMessage()` ya existe en
   `src/lib/protocol.js`; se envía con el `send` que devuelve `useGameSocket`.
   El servidor responde `game_over` **a los dos** jugadores.
4. **Jaque mate y tablas.** `useChessGame` ya expone `isCheckmate` e `isDraw`
   en su instantánea, pero nadie los mira: el protocolo no tiene un mensaje para
   el mate, así que el final por reglas lo detecta cada cliente por su cuenta.
   Decidir cómo se muestra.
5. **UI de errores.** El estado `lastError` de `src/App.jsx` guarda
   `{ code, message }` tal como llegan del servidor. Hoy se muestra en un
   párrafo de reemplazo. Los códigos están en la sección 4.3 y son estables:
   conviene reaccionar según el código y no según el texto. Los que el usuario
   puede provocar de verdad son `ROOM_NOT_FOUND`, `ROOM_FULL`,
   `INVALID_TOKEN_FORMAT` e `INVALID_CHAT`.
6. **Estética.** `src/index.css` y `src/App.css` son andamiaje: layout mínimo
   para poder probar, pensado para reemplazarse entero.

**Restricciones que hay que respetar:**

- **No cambiar el formato de los mensajes.** El servidor está cerrado y sus 89
  pruebas deben seguir pasando. Si algo parece necesitar un campo nuevo,
  discutirlo antes: casi siempre se resuelve en el cliente.
- **No romper el bloqueo de turno.** `GameScreen` impide mover fuera de turno
  antes de enviar nada. No basta con que el servidor lo rechace.
- **La dirección del servidor tiene que seguir siendo editable** desde la
  interfaz. Es el plan de respaldo de la demostración.
- No agregar backend, API REST ni base de datos.
- Código y nombres en inglés. Los textos visibles al usuario, en español.
- `src/components/Board.css` tiene la geometría del tablero además de los
  colores. Los colores son libres; la rejilla y el tamaño relativo de las
  piezas conviene dejarlos como están.
- Las piezas son SVG en `src/components/Piece.jsx`, no caracteres Unicode, y
  se tiñen con `color` y las variables `--piece-stroke` y `--piece-detail`.
  Cambiar el tema del tablero es cambiar esas tres cosas.

**Detalles del chat que ya están decididos por el servidor:**

- El texto se limpia de caracteres de control y se recorta; después debe medir
  entre 1 y 200 caracteres, o el servidor devuelve `INVALID_CHAT`.
- El servidor **no** devuelve al emisor su propio mensaje: solo lo retransmite
  al rival. El eco propio lo tiene que agregar el cliente al enviar.
- Chatear sin rival en la sala devuelve `NO_OPPONENT`. Ese código no está en la
  tabla de la sección 4.3 porque lo levanta `server.py` y no `protocol.py`;
  conviene contemplarlo igual.

**Cómo probar:** ver la sección 7. Para el chat, el cliente de consola es más
rápido que abrir un segundo navegador: `python3 -m tools.console_client`, luego
`join <token> <apodo>` y `chat <texto>`.

**Fuera de alcance del bloque 3:** los diagramas, la tabla de pruebas del
informe y el material teórico. Eso se hace al final, con la aplicación ya
terminada.

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

### 27 de agosto de 2026 — Bloque 2

- Se construyó el cliente completo sobre el contrato de la sección 4, sin tocar
  un solo archivo del servidor. Las 89 pruebas del bloque 1 siguen pasando.
- Orden de construcción: capa de protocolo y configuración → hook de conexión →
  hook del motor de ajedrez → tablero → vistas → unión en `App.jsx`. Cada capa
  se verificó contra el servidor real antes de montar la siguiente.
- **Problema encontrado: las piezas Unicode no se dibujan de forma fiable.** El
  bloque `U+2654..U+265F` depende de qué fuente de símbolos tenga instalada la
  máquina. En la primera captura, el rey, la dama, la torre, el alfil y el
  caballo salían como cuadros vacíos, y el peón salía negro en los dos bandos
  porque ganaba la fuente de emoji a color, que ignora `color`. Se reemplazaron
  por SVG dibujados a mano en `src/components/Piece.jsx`. Además de arreglarlo,
  esto deja el color de cada bando bajo control de CSS.
- **Problema encontrado: el tablero del que espera se veía a media luz.** Las 64
  casillas son `<button>`, y las del jugador que no tiene el turno están
  `disabled` para impedir la jugada. La regla global `button:disabled { opacity:
  0.45 }` las alcanzaba a todas, así que medio tiempo de la partida el tablero
  se veía apagado. Se corrigió con `.square:disabled { opacity: 1 }`: la casilla
  no se puede pulsar, pero la posición se sigue leyendo igual de bien.
- **Problema encontrado: dos pestañas del mismo navegador comparten
  `localStorage`.** Al probar con dos pestañas, el segundo apodo pisaba al
  primero. No es un error del código —es cómo funciona el almacenamiento por
  origen— pero sí condiciona la demostración: hacen falta dos navegadores
  distintos, o uno normal más uno de incógnito. Queda anotado en la sección 7.
- **Problema encontrado: el protocolo no tiene un mensaje para salir de una
  sala.** "Cancelar" en la sala de espera y "Volver al inicio" no tenían forma
  de decírselo al servidor. Como el servidor destruye la sala en cuanto se cae
  el socket, la única salida es cerrar la conexión: por eso `useGameSocket`
  expone `reconnect()`. Por lo mismo, perder el socket devuelve al jugador al
  inicio en lugar de dejarle un tablero muerto en pantalla.
- **Problema encontrado: `StrictMode` monta los efectos dos veces.** El socket
  se abría, se cerraba y se volvía a abrir al arrancar, y la lógica de
  reconexión peleaba contra su propia limpieza. El efecto marca su cierre como
  deliberado para no programar una reconexión encima.
- **Decisión: una jugada que no se pudo enviar se deshace.** Se juega primero en
  `chess.js` y después se envía. Si el envío falla, se llama a `undo()`: dejarla
  puesta desincronizaría los dos tableros sin que ninguno de los dos jugadores
  se enterara.
- **Decisión: el FEN del rival manda.** Las jugadas que llegan se reproducen
  localmente para conservar el historial, pero si la posición resultante no
  coincide con el FEN recibido, se carga el FEN. Nunca se dejó ver una
  discrepancia en las pruebas; es un seguro contra la deriva.
- Se cubrieron a propósito las jugadas donde el FEN es la única descripción
  completa: enroque (se mueven dos piezas), al paso (desaparece una pieza de una
  casilla que no es ni `from` ni `to`) y promoción (llega una pieza distinta de
  la que salió). Las tres se verificaron entre dos navegadores.

---

## 10. Convenciones del repositorio

- **Ramas:** Gitflow. `main` estable, `dev` de integración, `feature/*` para cada
  bloque. El bloque 1 se desarrolló en `feature/socket-server`; el bloque 2, en
  `feature/react-client`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`,
  `test:`), en inglés.
- **Código:** en inglés, incluidos nombres y comentarios.
- **Textos de usuario y documentación:** en español.

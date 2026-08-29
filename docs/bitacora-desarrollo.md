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
| **3. Chat y estética** | Chat, fin de partida, rendición, UI de errores, diseño minimal | ✅ Terminado |

Los tres bloques están terminados: la aplicación se juega de principio a fin.
Los diagramas, la tabla de pruebas del informe y todo el material teórico quedan
**fuera** de estos bloques: se elaboran ahora, con la aplicación ya terminada.
La sección 8 dice qué queda y con qué contar para hacerlo.

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
| `src/components/NicknameForm.jsx` | Primera vista: pide el apodo. *(Fundido en `Home.jsx` en el rediseño; ver más abajo.)* |
| `src/components/Lobby.jsx` | Crear partida o unirse con un token. *(Ídem.)* |
| `src/components/WaitingRoom.jsx` | Muestra el token mientras no llega el rival. |
| `src/components/GameScreen.jsx` | La partida: turno, selección de casillas, promoción. |
| `src/components/PromotionPicker.jsx` | Pregunta la pieza antes de enviar la jugada. |
| `src/components/ServerSettings.jsx` | Estado de la conexión y edición de la dirección del servidor. |
| `src/App.jsx` | Estado de sesión (apodo, sala, fase) y unión entre el socket y el motor. |

La dependencia también va en una sola dirección: `App.jsx` → hooks → `lib/`, y
`App.jsx` → componentes → `lib/`. Ningún componente abre el socket por su
cuenta: todos los mensajes salen y entran por `App.jsx`.

### Archivos del bloque 3

| Archivo | Responsabilidad |
|---|---|
| `src/components/Chat.jsx` | El chat: historial y redacción. El historial lo guarda `App.jsx`. |
| `src/components/GameOver.jsx` | Lee el resultado desde el punto de vista del jugador local. |
| `src/components/ResignButton.jsx` | Rendición con confirmación en línea. |
| `src/components/ErrorBanner.jsx` | Traduce el `code` del servidor a una salida concreta. |
| `src/index.css` | Los tokens de diseño y los valores por defecto de los elementos. |
| `src/App.css` | Disposición y componentes. Ningún color en crudo. |

El bloque no añadió ni una llamada de socket: se apoya entero en el contrato de
la sección 4, que ya tenía `chat`, `resign` y `game_over`. Tampoco tocó ningún
archivo del servidor.

### Archivos de la maqueta Gambito

La interfaz se rehízo sobre un diseño externo (ver la entrada del 29 de agosto
en la sección 9). Estos son los archivos que cambiaron de forma o aparecieron:

| Archivo | Responsabilidad |
|---|---|
| `src/index.css` | Los tokens del sistema Classical y los valores por defecto de los elementos. |
| `src/design-system.css` | La capa de componentes del sistema: `.btn`, `.card`, `.tag`, `.nav`, `.table`, `.dialog`, `.input`, `.seg`, `.hr`. |
| `src/App.css` | Las pantallas de la maqueta montadas sobre esa capa. |
| `src/components/Home.jsx` | La vista de inicio: apodo, crear o unirse. Sustituye a `NicknameForm.jsx` y `Lobby.jsx`. |
| `src/components/MoveHistory.jsx` | La columna izquierda de la partida: lista de jugadas, PGN y piezas capturadas. |
| `src/components/Avatar.jsx` | La inicial del jugador en un círculo del color que juega. |
| `src/components/CopyButton.jsx` | Copiar al portapapeles y decirlo por un momento. Lo usan el token y el PGN. |
| `src/components/Icon.jsx` | Los cuatro iconos de Lucide que la interfaz necesita, en línea. |

Se eliminaron `src/components/NicknameForm.jsx` y `src/components/Lobby.jsx`:
la maqueta pide el apodo y la elección de crear o unirse en una sola tarjeta, y
las dos vistas se fundieron en `Home.jsx`. El apodo se sigue recordando entre
visitas.

Dos funciones nuevas en `src/lib/pieces.js` sostienen la columna izquierda, y
ninguna de las dos habla con el servidor:

- `capturedMaterial(board)` cuenta las piezas que faltan **en la posición**, no
  en la lista de jugadas: una resincronización carga un FEN y deja a `chess.js`
  sin historial, mientras que el tablero siempre es correcto.
- `toSpanishSan(san)` pasa `Nf3` a `Cf3` para la pantalla. El PGN que va al
  portapapeles se queda en inglés, que es el estándar: un PGN en español no
  abriría en ningún otro programa.

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
| `NO_OPPONENT` | Se intentó chatear antes de que llegara el rival. |

Los quince primeros los levanta `server/protocol.py` al validar el mensaje;
`NO_OPPONENT` lo levanta `server/server.py`, porque no depende de la forma del
mensaje sino del estado de la sala. Para el cliente son indistinguibles: llegan
los dos como `error` con el mismo formato.

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

**Para probar el chat** el cliente de consola es más rápido que abrir un segundo
navegador: `python3 -m tools.console_client`, luego `join <token> <apodo>` y
`chat <texto>`.

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

**Cliente (bloque 3).** Las 89 pruebas del servidor siguen pasando: el bloque no
tocó ningún archivo suyo. Sobre eso, dos niveles más:

- *Protocolo.* Un guion con dos clientes de socket crudos
  (`tools/ws_client.py`) comprobó las ocho conductas del servidor de las que
  depende el bloque: `NO_OPPONENT` al chatear sin rival, retransmisión del chat
  con `from` y `text`, `INVALID_CHAT` con 201 caracteres, limpieza y recorte del
  texto, `game_over` idéntico **a los dos** jugadores tras `resign`, el ganador
  correcto, que se puede seguir chateando después de la rendición, y
  `opponent_left` al cerrarse el socket del rival.
- *Navegador.* Partida completa contra el servidor real, con el cliente de
  consola de rival: apodo, creación de sala, unión, chat en las dos direcciones
  con el eco propio alineado a la derecha, jugada `e2e4` sincronizada, rendición
  del rival con la pantalla de victoria, `ROOM_NOT_FOUND` con su aviso, y mate
  del loco (`f3 e5 g4 Dh4#`) detectado por el propio cliente sin ningún mensaje
  del servidor. Se revisaron los dos temas, claro y oscuro.

Queda una limitación conocida, y es del cliente de consola, no de la web: cuando
el rival se va, el servidor saca de la sala solo al que se fue, así que el que
queda sigue asociado a una sala terminada y un `join` nuevo le responde
`ALREADY_IN_ROOM`. El cliente web no lo sufre porque volver al inicio cierra el
socket —la única forma de salir de una sala, según se explica en la sección 9—;
el de consola no lo cierra, y hay que reiniciarlo.

---

## 8. Qué queda fuera del código

La aplicación está terminada: se juega de principio a fin, con chat, rendición,
final por reglas y aviso de errores. Lo que falta no es código, es el informe, y
esta bitácora está escrita para que se pueda redactar sin volver a leer los
fuentes.

**De dónde sale cada cosa:**

| Lo que pide el enunciado | Dónde está aquí |
|---|---|
| Descripción del protocolo | Sección 4 completa: mensajes en los dos sentidos, con ejemplos reales. |
| Los diez métodos de socket | Sección 6: cada uno con el archivo y la línea donde se usa, y por qué. |
| Diagrama de secuencia | Sección 4.4, ya dibujado; falta pasarlo a la herramienta del informe. |
| Diagrama de actividad | Por hacer. Las fases del cliente (`lobby`, `waiting`, `playing`, `finished`) y sus transiciones están en la cabecera de `src/App.jsx`. |
| Tabla de pruebas | Sección 7, "Verificación ya realizada": qué se probó en cada bloque y contra qué. |
| Decisiones de diseño | Sección 2, cada una con la alternativa que se descartó y el motivo. |
| Problemas y soluciones | Sección 9, en orden cronológico. |

**Si alguien vuelve a tocar el código,** las restricciones que se respetaron en
los tres bloques siguen valiendo: no cambiar el formato de los mensajes —el
servidor está cerrado y sus 89 pruebas deben seguir pasando—, no romper el
bloqueo de turno en el cliente, dejar la dirección del servidor editable desde
la interfaz, y nada de backend, API REST ni base de datos. Código y nombres en
inglés; los textos que ve el usuario, en español.

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

### 29 de agosto de 2026 — Bloque 3

- Se cerró el cliente sobre el contrato de la sección 4, sin tocar el servidor.
  Las 89 pruebas siguen pasando. Orden: chat → rendición y fin de partida → UI
  de errores → estética.
- **Decisión: el eco del propio mensaje lo pone el cliente.** El servidor
  retransmite el chat solo al rival, nunca de vuelta a quien lo escribió. Para
  que las dos pantallas digan exactamente lo mismo, el cliente limpia el texto
  igual que el servidor —quita caracteres de control y recorta— y guarda esa
  versión ya normalizada, no la que se tecleó.
- **Decisión: el mate y las tablas se leen del tablero, no se guardan.** El
  protocolo no tiene un mensaje para el final por reglas y no le hace falta: los
  dos clientes tienen la misma posición y `chess.js` llega al mismo veredicto en
  cada uno, así que el final se detecta dos veces en paralelo en vez de
  anunciarse. Se calcula durante el render, no en un `useEffect` con estado
  propio: la posición ya afirma que la partida terminó, y una segunda copia de
  ese hecho solo podría acabar contradiciéndola. El linter de React marcaba
  precisamente eso.
- **Decisión: los errores se distinguen por `code`, no por texto.** La sección
  4.3 promete que el código es estable y que el mensaje es texto libre. Cada
  código conocido lleva además la salida concreta —qué hacer para que no vuelva
  a pasar—; uno desconocido cae en el mensaje del servidor, que es justo el caso
  en el que conviene leerlo tal cual.
- **Decisión: la rendición se confirma en la propia página.** Un `confirm()` del
  navegador bloquea el hilo mientras está abierto, y con él la llegada de
  mensajes del socket. El botón se convierte en la pregunta.
- **Decisión: tipografía del sistema, no una fuente de Google.** Toda la
  estética pasa por tokens CSS, y el modo oscuro es un único bloque que los
  redefine. La fuente se dejó como la del sistema a propósito: la aplicación
  tiene que funcionar en una red local sin internet —es el sentido del taller— y
  una fuente servida desde un CDN fallaría exactamente durante la demostración.
- **Problema encontrado: los estilos globales de `button` llegaban a las 64
  casillas.** El tablero está hecho de botones, así que heredaba el borde al
  pasar el ratón, el radio de esquina y el fondo del botón genérico. Es el mismo
  choque que en el bloque 2 con `opacity` en los botones deshabilitados. Se
  neutralizó en `Board.css`, y el anillo de foco se metió hacia dentro con
  `outline-offset: -3px` para que no se dibuje encima de la casilla vecina.
- **Problema encontrado: las coordenadas del tablero desaparecían en modo
  oscuro.** Las letras y números de las casillas heredaban el color del texto de
  la página, que en oscuro es casi blanco, sobre casillas claras. Ahora cada
  casilla fija el color de su coordenada a partir del color de la casilla
  contraria.
- **Problema encontrado: las piezas perdían contraste al reutilizar los colores
  del tablero.** Se les dieron tokens propios (`--piece-white`, `--piece-black`,
  `--piece-line`), independientes del tema, porque el contraste que importa es
  el de la pieza contra su casilla y ese no cambia entre claro y oscuro. En el
  diálogo de promoción, que está fuera del tablero, cada pieza lleva encima un
  cuadrado del color de las casillas claras: sobre la tarjeta blanca, las piezas
  blancas no se veían.
- **Problema encontrado: con el tablero y el chat lado a lado, el chat se salía
  de la pantalla.** El tablero pedía `min(76vmin, 560px)` y no cedía. Se pasó la
  fila a una rejilla con la columna del tablero en `minmax(0, auto)`: cuando la
  ventana no da para los dos, el que se encoge es el tablero, que ya estaba
  limitado a `max-width: 100%`.
- **Hallazgo: el cliente de consola se queda atrapado en una sala terminada.**
  Cuando el rival se va, el servidor saca de la sala solo al que se fue; el que
  queda sigue asociado a ella y un `join` nuevo recibe `ALREADY_IN_ROOM`. El
  cliente web no lo nota porque volver al inicio cierra el socket, que es la
  única forma de salir de una sala. Está anotado en la sección 7; no se tocó el
  servidor por ello.

### 29 de agosto de 2026 — Bloque 3, segunda iteración estética

Con la aplicación ya funcionando se rehízo la estética. La primera versión era
correcta pero anónima: gris azulado y todo metido en tarjetas.

- **Decisión: papel y tinta, no gris.** El verde de fieltro y el ámbar se
  quedan —son lo que ata la página al tablero— pero el resto pasa a marfil
  cálido en claro y a tinta cálida en oscuro. La referencia es un libro de
  ajedrez impreso.
- **Decisión: filetes en vez de tarjetas.** Las secciones se separan con una
  línea. La tarjeta se conserva solo donde algo está de verdad **al lado** del
  tablero y hay que distinguirlo de él: el chat y la tarjeta de fin de partida.
  Junto a un tablero, que ya es un objeto denso, una página de cajas compite.
- **Decisión: dos familias del sistema.** Serif para lo que se lee (títulos,
  el token, los nombres de los jugadores) y sans para lo que se opera (botones,
  campos, chat). Las etiquetas de sección —`CREAR UNA PARTIDA`, `CHAT`— siguen
  en sans y en versalita espaciada, porque nombran un control y no encabezan
  algo que se lea. Las dos familias son las del sistema: sin internet en la sala
  no hay fuente de CDN que valga.
- **Decisión: el token como placa de imprenta.** Serif grande, interletrado
  ancho y filete doble arriba y abajo. Sin separadores entre los caracteres a
  propósito: seleccionarlo sigue copiando exactamente los cinco que el rival
  tiene que teclear.
- **El contraste se midió, no se estimó.** Con la fórmula de luminancia relativa
  de WCAG sobre cada par de la paleta. El verde anterior, `#15803D`, daba
  **4.44:1** sobre el marfil nuevo: por debajo del mínimo de 4.5. Se bajó a
  `#14702F` (5.5:1) y el ámbar a `#9A4708` (5.7:1). Todos los pares de texto
  pasan de 4.5:1 en los dos temas; los apagados rondan 6:1.
- **Problema encontrado: el marco del tablero desaparecía en modo oscuro.** Se
  dibujó como filete doble del color de la tinta, y en oscuro «tinta» se había
  puesto casi negro sobre un fondo casi negro. El marco necesita contraste
  contra la página, no seguir al texto: en oscuro es una línea cálida clara.
  El segundo filete se dibuja con `box-shadow` y no con `outline`, para que no
  participe del layout y el tablero pueda ocupar el ancho completo en una
  pantalla estrecha.
- **Ajuste: las vistas de una sola columna van centradas.** Apodo, lobby y sala
  de espera se centran enteros —títulos, textos, etiquetas y campos— como la
  portada de un libro: hay una sola cosa que leer y nada contra lo que alinear.
  Las vistas con tablero quedan fuera a propósito: ahí todo se alinea al
  tablero y los asientos tienen que quedarse en sus bordes. Un campo no hereda
  la alineación del bloque, así que se centra aparte; la dirección del servidor,
  que es larga y vive fuera de esos bloques, se queda a la izquierda.
- **Ajuste: el caballo del encabezado va en tinta.** Estaba en el verde
  primario y quedaba como una insignia pegada al título. En el color del texto
  se lee como parte del propio rótulo.
- **Problema encontrado: el filete de la cabecera cambiaba de ancho.** `.app` es
  un elemento flex que se ajusta a su contenido, así que la regla del encabezado
  mide lo que mida lo de abajo. Está bien —queda alineada con el contenido en
  todas las vistas— salvo que aparecía un aviso de error más ancho que el
  formulario y la regla daba un salto. El aviso se limitó a la misma medida que
  los formularios.

### 29 de agosto de 2026 — Bloque 3, tercera iteración estética (definitiva)

La segunda iteración quedó correcta pero apagada: demasiado sobria y con una
paleta —marfil y verde— que no convencía. Se rehízo por tercera y última vez
con tres decisiones tomadas a partir de eso.

- **Decisión: un solo tema, el claro.** Se eliminó el bloque
  `prefers-color-scheme: dark` entero. La aplicación se muestra en una sala de
  clases, en máquinas cuyo tema nadie controla, y un aspecto que se sabe
  revisado vale más que dos revisados a medias.
- **Decisión: la página es slate y el contenido es blanco.** De ahí sale la
  presencia que faltaba. Antes las tarjetas eran de un blanco roto sobre un
  fondo marfil y no se separaban de nada; ahora `.card` es blanco sobre
  `#F1F5F9` y se recorta solo, sin necesitar un borde pesado. `.card` es además
  el único contenedor: se acabaron `.sheet` y `.section`.
- **Decisión: azul, no verde.** Primario `#1D4ED8` y tablero en el azul-gris
  clásico (`#DEE3E6` / `#8CA2AD`). El anillo de selección y el resaltado de la
  última jugada se quedan en ámbar, que es el complementario del azul y por eso
  se ve de inmediato sobre las dos casillas.
- **Decisión: fuera el serif; la jerarquía la dan el peso y el tamaño.** Una
  sola familia, la del sistema, con títulos a 700 y tracking cerrado.
- **Decisión: el token es la única superficie oscura de la página.** Placa
  `#1E293B` con el texto en blanco (14.6:1). Es lo que alguien lee en voz alta
  al otro lado de una sala, así que es lo más pesado de la pantalla.
- **Decisión: el asiento de quien tiene el turno es una tarjeta teñida**, no una
  barra de 3 px. El borde mide lo mismo en los dos estados para que el tablero
  no se mueva al cambiar el turno.
- **Contrastes medidos** (fórmula de luminancia relativa de WCAG, sobre el fondo
  `#F1F5F9`): texto `#0F172A` 16.3:1 · apagado `#475569` 6.9:1 · primario
  `#1D4ED8` 6.1:1 · acento `#9A3412` 6.7:1 · peligro `#B91C1C` 5.9:1 · blanco
  sobre el primario 6.7:1 · blanco sobre la placa 14.6:1. Todos por encima de
  4.5:1.

**Las piezas, rehechas en Staunton.** Las seis se redibujaron con la estructura
del set real: pie ancho, plinto, trompeta, y encima la parte que da nombre a la
pieza. El peón es el único con el pie más estrecho, como en un tablero de
verdad.

- **Problema encontrado: el caballo parecía un pájaro.** El primer intento
  trazaba la cara como una diagonal larga desde la frente hasta un morro en
  punta, sin mandíbula. Se redibujó recorriendo la silueta en orden —oreja,
  nuca, cuerpo, base, pecho, garganta, mandíbula, mentón, caña de la nariz,
  frente— y son la mandíbula y el morro romo los que hacen que se lea como un
  caballo. La crin va como trazo de detalle y el ojo como un círculo.
- **El contorno de las piezas es estructural, no decorativo.** Una pieza blanca
  mide **1.2:1** contra una casilla clara: sin el contorno oscuro sencillamente
  desaparecería. La negra sobre casilla clara da 11.4:1 y la blanca sobre
  casilla oscura, 2.5:1 más el contorno. Es el mismo juego de formas el que
  tiene que leerse sobre los dos colores de casilla, y eso lo resuelve el
  contorno.

### 29 de agosto de 2026 — Bloque 3, paleta Flexoki Light y corrección de las piezas

**Los valores de color vigentes son los de esta entrada**, no los de la
anterior: la paleta slate/azul se reemplazó por Flexoki Light.

- **Decisión: la paleta es Flexoki Light, tomada del tema instalado.** Los
  valores salen de `/usr/share/omarchy/themes/flexoki-light/colors.toml`, del
  propio equipo donde se desarrolló, así que son los de la paleta y no una
  imitación. La página usa su `dark_background` `#F2EFE4` y las tarjetas su
  `paper` `#FFFCF0`, con lo que se conserva la estructura que daba presencia:
  el contenido más claro que la página.
- **Dos pasos de Flexoki hubo que elegirlos, no copiarlos.** Su
  `dark_foreground` (base-500 `#878580`) da **3.2:1** sobre la página y su
  `orange` (`#D0772B`) da **4.2:1**: los dos por debajo del mínimo de 4.5. El
  texto apagado usa base-700 `#575653` (6.4:1) y el acento, orange-700
  `#9D4310` (5.6:1). Es el tipo de cosa que solo aparece midiendo.
- **Contrastes vigentes** sobre la página `#F2EFE4`: texto `#100F0F` 16.6:1 ·
  apagado `#575653` 6.4:1 · primario `#205EA6` 5.7:1 · acento `#9D4310` 5.6:1 ·
  peligro `#AF3029` 5.6:1 · paper sobre el primario 6.4:1 · paper sobre la placa
  `#282726` 14.5:1. Todos por encima de 4.5:1.
- **Flexoki no trae par de casillas**, porque es una paleta de interfaz. Se
  eligió de su rampa neutra: base-50 `#F2F0E5` contra base-400 `#9F9D96` da
  **2.4:1**, que es donde está un tablero de madera real (el verde/marfil
  anterior daba 2.3:1). El anillo de selección y la última jugada toman el
  amarillo de Flexoki, el único tono de la paleta que se ve al instante sobre
  las dos casillas.

**Correcciones a las piezas**, las tres detectadas mirándolas grandes:

- **Problema: la base se leía como rayas.** Cada pieza apilaba trompeta, plinto
  y pie —tres o cuatro bandas horizontales finas— y el resultado parecía un
  pastel de capas, no algo torneado. Ahora son dos formas y una sola línea
  divisoria, y **el cuerpo de cada pieza termina exactamente en el borde
  superior de la trompeta**, de modo que pieza y base son una silueta continua
  en vez de una figura puesta sobre un posavasos.
- **Problema: a la corona de la dama le faltaba la punta central.** El trazado
  pasaba plano por debajo de la perla del medio en vez de subir hasta ella, así
  que esa perla quedaba flotando. Ahora la corona tiene sus cinco puntas y los
  cuatro valles entre ellas.
- **Problema: el morro del caballo era una cuchilla.** El pecho subía hasta una
  garganta muy a la derecha y la mandíbula volvía casi paralela a él, dejando
  una cuña finísima. Se rehízo el orden de la silueta: el cuello sube desde la
  base, la mandíbula se proyecta a la izquierda por encima del pecho y el morro
  es un bloque, no una punta. Ese voladizo de la mandíbula sobre el pecho es lo
  que hace que se lea como un caballo.
- Se quitó la banda de la corona del rey: era un trazo horizontal de lado a lado
  y se leía como un tachón. La cruz ya identifica la pieza.

### 29 de agosto de 2026 — Rediseño sobre la maqueta Gambito

**Los valores de color vigentes son los de esta entrada.** La paleta Flexoki
Light de la entrada anterior queda sustituida por el sistema Classical, que
llega con el diseño importado.

Se importó un diseño externo hecho en Claude Design: el proyecto **Gambito**
(`2bf8ef68-e506-4962-a19e-ff5d6c3cc262`), que trae una maqueta de todas las
pantallas (`Gambito.dc.html`) y un sistema de diseño propio, **Classical**
(`_ds/classical-…/styles.css` y su `readme.md`). La aplicación pasa a llamarse
Gambito.

- **Qué es Classical.** Un sistema editorial sobre un fondo casi blanco
  `#F3F2F2`: Cormorant Garamond para los títulos sobre Lora para el texto,
  filetes de un píxel, y el color aplicado como trazo y no como relleno. Un solo
  acento, un dorado `#B68235`, con rampas de 100 a 900 generadas en OKLCH sobre
  una misma escala de luminosidad. Los botones son contorno, nunca relleno; las
  tarjetas van bordeadas y sin fondo.
- **Las dos fuentes se instalaron, no se enlazaron.** El sistema las carga desde
  el CDN de Google Fonts. Esta aplicación se muestra en una LAN sin salida a
  internet —que es el objeto entero del ejercicio— y ese enlace fallaría justo
  durante la demostración. Van como paquetes npm (`@fontsource/…`), solo el
  subconjunto latino y solo los pesos 400 y 600: cuatro archivos que Vite mete
  en el build. Mismas tipografías, ninguna petición de red.

**Tres cosas del sistema importado hubo que corregirlas, y las tres son de
contraste sobre texto pequeño:**

- **`.text-muted` se mezcla al 65%, no al 55%.** Al 55% mide **3.6:1** sobre la
  página, y todo lo que aquí lleva esa clase —pistas, pies, el contador de
  jugadas, las coordenadas del tablero— es texto pequeño, que necesita 4.5:1.
  65% es el primer paso que lo consigue sobre los cuatro fondos de la
  aplicación: página 4.6:1, superficie 4.6:1, casilla clara 4.6:1, casilla
  oscura 4.5:1.
- **El acento en texto pasa a `accent-700`.** Esto no es una desviación: el
  propio `readme.md` de Classical dice que el par acento/fondo está ajustado a
  3:1, «suficiente para iconos, texto grande y cromo de interfaz», y que para
  texto de tamaño de párrafo se use un paso profundo de la rampa. El
  `.card-kicker` de 10px, la etiqueta de autor del chat y las etiquetas de los
  botones son texto pequeño: van en `accent-700` (6.0:1 en vez de 3.0:1). El
  borde de los botones sí se queda en el acento, que es cromo.
- **Se añadió una rampa de peligro**, porque Classical es monocromo dorado y no
  trae ningún color para algo que ha salido mal —y esta aplicación tiene un
  servidor que puede rechazar una jugada, un token que se puede escribir mal y
  un socket que se puede caer. Los cuatro pasos se generaron como dice el
  readme que se generaron los demás: la misma luminosidad OKLCH que
  `accent-100/300/700/800`, en un rojo cálido, tomando el mayor croma que se
  queda dentro de sRGB. Resultado: `#FFF0EE`, `#FFC2B9`, `#A0322C`, `#73221E`.
  Todos los pares de texto pasan de 4.5:1 (`danger-700` sobre la página, 6.3:1).

**Un cambio tipográfico, y es el único sitio donde no se pudo respetar la
maqueta:**

- **La lista de jugadas va en Lora, no en Cormorant.** La maqueta la pone en la
  tipografía de títulos a 15px, y a ese tamaño la `e` minúscula de Cormorant
  pierde el travesaño y se lee como una `c`. En notación algebraica eso no es
  una letra más bonita: `e4` y `c4` son casillas distintas. Comprobado al lado
  con Lora al mismo tamaño, donde el travesaño es inequívoco. Todo lo demás que
  la maqueta pone en Cormorant es una palabra, una mayúscula o una cifra, donde
  el contexto desambigua, y ahí la tipografía se queda.

**Qué de la maqueta se implementó y qué no.** El proyecto de diseño se
sincronizó con el repositorio cuando `main` era todavía el andamio de Vite (así
lo dice su `github.md`), de modo que la maqueta dibuja funciones que el
protocolo de la sección 4 no tiene. Lo que se pudo cumplir con honestidad, se
cumplió; lo que habría exigido mentir, no.

Implementado, y todo con datos reales:

| De la maqueta | Cómo se cumple |
|---|---|
| Pantalla Inicio partida en dos | Tal cual, incluidos el titular de 76px, los pasos I/II/III y el control segmentado. |
| Pantalla Unirse | Dentro de la tarjeta de Inicio, con el campo de token del tamaño y el interletrado que ella le da. Es el control segmentado quien decide, y añadir un paso de navegación que el protocolo no necesita habría sido peor. |
| Pantalla Crear sala | Tal cual, menos el enlace para compartir. |
| Historial de jugadas | Real, desde `chess.js`, en notación española. |
| Copiar PGN | Real, en inglés. |
| Piezas capturadas y ventaja material | Reales, contadas desde la posición. |
| Barra de navegación de la partida | Tal cual, con «Abandonar» que sí existe. |
| Chat con burbujas y frases rápidas | Tal cual. Las tres frases envían un `chat` normal. |
| Diálogo de fin de partida | Tal cual, con «Seguir aquí» en el lugar de la revancha. |
| Franja de aviso a todo el ancho | Reutilizada para los errores del servidor, en la rampa de peligro. |

No implementado, y por qué:

| De la maqueta | Por qué no |
|---|---|
| Relojes 5+3 | El servidor no lleva tiempo y el protocolo no lo transporta. Su hueco en el asiento se conserva y dice lo que el reloj estaba ahí para decir: a quién le toca. |
| Ofrecer tablas, revancha | Harían falta mensajes que la sección 4 no tiene. |
| Pantalla de sala de espera con «Comenzar» | El servidor arranca la partida en cuanto el segundo jugador entra; un botón que no hiciera nada sería un adorno mentiroso. Su contenido (avatar, nombre, color, estado) vive en los asientos de la partida. |
| Franja de reconexión | El servidor destruye la sala en cuanto el socket se va, y no guarda estado entre conexiones. No hay a qué reconectarse. |
| Flechas ⟨ ⟩ para recorrer la partida | Es funcionalidad, no diseño: obliga a tener en pantalla una posición que no es la que se juega y a decidir qué pasa cuando llega una jugada a mitad del rebobinado. |
| Apertura detectada | Necesita un libro de aperturas que la aplicación no lleva. |
| Enlace `gambito.app/s/TOKEN` | La aplicación se sirve desde un servidor de desarrollo en una dirección de LAN y no tiene ninguna ruta que acepte un token. El enlace sería una promesa que no puede cumplir. |

**Lo que la maqueta no podía dar**, porque cada mesa de trabajo suya es un
ancho de escritorio fijo con un apodo verosímil dentro: el comportamiento en
pantallas estrechas. Inicio se apila por debajo de 56rem, con el formulario
primero —en un teléfono lo que hay que hacer manda sobre lo que hay que leer—.
La partida se apila por debajo de 68rem en el orden tablero, chat, historial.
El tablero mide los 68px por casilla de la maqueta cuando hay sitio y se encoge
con su columna cuando no lo hay, con los marcadores de jugada legal expresados
en porcentaje para que conserven la proporción.

**Un error propio encontrado midiendo**, no mirando: a 413px de ancho la página
se desplazaba en horizontal. La causa era que el panel del formulario de Inicio
es una rejilla y su pista tomaba como mínimo los 400px fijos de la tarjeta, con
lo que el `max-width: 100%` de la tarjeta se medía contra esa misma pista y no
podía actuar nunca. Las pistas afectadas pasaron a `minmax(0, …)`.

**Verificación.** 89 pruebas del servidor, `oxlint` y `vite build` en verde.
Partida completa entre dos navegadores contra el servidor real: creación,
unión, seis jugadas, chat en las dos direcciones, mate del pastor, diálogo de
fin con «4 jugadas», peón capturado en la lista de capturas y ventaja `+1`.
Error `ROOM_FULL` provocado de verdad con un tercer jugador. Sin desbordamiento
horizontal a 413px ni a 803px.

---

## 10. Convenciones del repositorio

- **Ramas:** Gitflow. `main` estable, `dev` de integración, `feature/*` para cada
  bloque. El bloque 1 se desarrolló en `feature/socket-server`; el bloque 2, en
  `feature/react-client`; el bloque 3, en `feature/chat-and-polish`. El rediseño
  posterior sobre la maqueta Gambito va en `feature/gambito-design`, que sale de
  `feature/chat-and-polish` y por tanto se integra después de ella.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`,
  `test:`), en inglés.
- **Código:** en inglés, incluidos nombres y comentarios.
- **Textos de usuario y documentación:** en español.

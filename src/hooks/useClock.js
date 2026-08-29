import { useEffect, useState } from 'react'

/**
 * How often the display is refreshed. The figures shown are whole seconds, so
 * anything faster than this would repaint without changing anything.
 */
const TICK_MS = 200

/**
 * The two clocks, ticked locally between the server's readings.
 *
 * The server sends a reading when the game starts, after every move and when it
 * ends — and nothing in between. A countdown is perfectly predictable, so the
 * only thing worth putting on the wire is the moment it changes; the rest is
 * arithmetic either side can do.
 *
 * The current instant is held in state and refreshed by the interval, so
 * rendering stays a pure function of it. A reading that has just arrived can
 * therefore be a fraction of a tick ahead of `now`, which would make the
 * elapsed time negative; it is clamped at zero, so the worst that happens is
 * that the clock shows its full value for up to one tick longer.
 *
 * `reading.at` is when this browser received the reading, so the display runs
 * behind the server by one network hop. That is the right way round: it can
 * show a player slightly more time than they have, never less.
 */
export function useClock(reading) {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (!reading?.running) return undefined
    const id = window.setInterval(() => setNow(performance.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [reading])

  if (!reading) return null

  const elapsed = reading.running ? Math.max(0, (now - reading.at) / 1000) : 0

  return {
    white: reading.turn === 'white' ? Math.max(0, reading.white - elapsed) : reading.white,
    black: reading.turn === 'black' ? Math.max(0, reading.black - elapsed) : reading.black,
  }
}

/**
 * The one time control the app offers, mirrored from `INITIAL_TIME_SECONDS` in
 * server/rooms.py. The server is the authority; this copy is only here so the
 * interface can name the mode before a game has started.
 */
export const INITIAL_TIME_SECONDS = 300

/** Below this the clock changes colour. Half a minute is when it starts to hurt. */
export const LOW_TIME_SECONDS = 30

/**
 * Seconds as a clock reads them: `9:07`, `10:00`.
 *
 * Rounded up rather than down so the display only ever shows 0:00 when the time
 * is really gone, and so a fresh game reads 10:00 instead of 9:59.
 */
export function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/** The same value spelled out, for the accessible label. */
export function describeClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes === 0) return `${rest} segundos`
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} y ${rest} segundos`
}

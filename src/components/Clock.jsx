import { LOW_TIME_SECONDS, describeClock, formatClock } from '../lib/clock.js'
import { useClock } from '../hooks/useClock.js'

/**
 * One player's remaining time, in the slot the maquette drew a clock in.
 *
 * It ticks itself rather than being handed a number from above, so the twice-a-
 * second repaint stays inside these thirty pixels instead of running through
 * the move list and the chat.
 */
export default function Clock({ reading, color, isToMove }) {
  const times = useClock(reading)
  const seconds = times ? times[color] : null

  if (seconds === null) {
    return <span className="clock clock--idle">—</span>
  }

  const classes = ['clock']
  if (isToMove) classes.push('clock--running')
  if (seconds <= LOW_TIME_SECONDS) classes.push('clock--low')

  return (
    <span className={classes.join(' ')} aria-label={`Tiempo: ${describeClock(seconds)}`}>
      {formatClock(seconds)}
    </span>
  )
}

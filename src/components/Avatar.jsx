/**
 * A player, as the initial of their nickname in a circle.
 *
 * The two colours are the ends of the neutral ramp, the same pair the pieces
 * take, so a seat reads as the side it is playing before the label is read.
 */
export default function Avatar({ nickname, color, size = 'md' }) {
  const initial = (nickname ?? '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <span className={`avatar avatar--${color} avatar--${size}`} aria-hidden="true">
      {initial}
    </span>
  )
}

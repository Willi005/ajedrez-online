/**
 * The six chess pieces, drawn as inline SVG.
 *
 * The obvious alternative is the Unicode block at U+2654..U+265F, but glyph
 * coverage for it is inconsistent: on a machine without a symbol font the board
 * renders as empty boxes, and where a colour-emoji font wins the fallback the
 * white pieces come out black. Drawing the shapes removes that dependency and
 * lets both colours be tinted from CSS.
 *
 * The shapes follow the Staunton set — the one on every real board — so each
 * piece is recognised by its silhouette before anyone looks at the detail: a
 * wide foot, a plinth, a flare, then the part that names the piece.
 *
 * The outline is not decoration. A white piece measures about 1.2:1 against a
 * light square, so without a dark contour it would simply disappear; the
 * contour is what makes one set of shapes readable on both colours of square.
 *
 * All shapes share a 45x45 view box, the convention for chess piece sets.
 */

/* Every piece stands on the same foot and plinth. The pawn is the one piece
   that is narrower, as it is on a real board. */
const FOOT = (
  <>
    <rect x="10.6" y="32.4" width="23.8" height="3.2" rx="0.8" />
    <rect x="9" y="35.6" width="27" height="4.4" rx="1.9" />
  </>
)

const FOOT_NARROW = (
  <>
    <rect x="12.2" y="32.4" width="20.6" height="3.2" rx="0.8" />
    <rect x="11" y="35.6" width="23" height="4.4" rx="1.9" />
  </>
)

/* The trumpet between the body of a piece and its plinth. */
const FLARE_WIDE = 'M12.2 28.6 h20.6 c0 1.8 0.9 2.8 1.9 3.2 h-24.4 c1-0.4 1.9-1.4 1.9-3.2 z'
const FLARE_NARROW = 'M15.4 28.6 h14.2 c0 1.8 0.9 2.8 1.9 3.2 h-18 c1-0.4 1.9-1.4 1.9-3.2 z'

const SHAPES = {
  p: (
    <>
      <circle cx="22.5" cy="11" r="4.9" />
      <path d="M22.5 16.6 c-2.6 0-4.7 2-4.7 4.4 0 1.5 0.8 2.8 2.1 3.6 -3 1.9-5.2 5.4-5.8 8.2 h16.8 c-0.6-2.8-2.8-6.3-5.8-8.2 1.3-0.8 2.1-2.1 2.1-3.6 0-2.4-2.1-4.4-4.7-4.4 z" />
      {FOOT_NARROW}
    </>
  ),
  r: (
    <>
      {/* Three merlons and the two embrasures between them. */}
      <path d="M11.4 8 h4.6 v3.4 h4.2 V8 h4.6 v3.4 h4.2 V8 h4.6 v7.4 h-22.2 z" />
      <path d="M14.2 15.4 h16.6 l-1.2 13.2 h-14.2 z" />
      <path d={FLARE_WIDE} />
      {FOOT}
    </>
  ),
  n: (
    <>
      {/* The head in profile, traced clockwise from the ear: down the back of
          the neck, across the body, up the chest to the throat, then out along
          the jaw to the chin, up the bridge of the nose and back to the ear.
          The jaw and the blunt muzzle are what stop it reading as a bird. */}
      <path d="M26.6 5.4 l0.9 4.3 c5.8 2.2 9 8.2 9 16.4 c0 3.2-0.3 5.8-0.7 7.9 h-16.7 c0.3-6.3 2.7-10.5 6.9-13.3 c-0.7-2.5-2.2-3.7-4.1-3.4 c-1.5 0.3-2.6 1.5-3.7 2.6 c-1.2 1.2-2.7 2-4.3 1.7 c-1.5-0.3-2.1-1.7-1.5-3.1 c0.6-1.4 2-2.6 3.4-3.7 l4.3-3.4 c0.5-1.9 1.3-3.6 2.3-5 l1.5 2.4 z" />
      <path
        d="M27.3 10.6 c3.4 2.9 5.2 7.7 5.4 14.2"
        stroke="var(--piece-detail)"
        strokeWidth="1.3"
        fill="none"
      />
      <circle cx="18.7" cy="15.4" r="1.25" fill="var(--piece-detail)" stroke="none" />
      {FOOT}
    </>
  ),
  b: (
    <>
      <circle cx="22.5" cy="6" r="2.4" />
      <path d="M22.5 9.2 c4.4 3.6 7.1 8.4 7.1 12.5 c0 3.5-3.2 5.9-7.1 5.9 s-7.1-2.4-7.1-5.9 c0-4.1 2.7-8.9 7.1-12.5 z" />
      <path d="M15.6 26.4 h13.8 v2.2 h-13.8 z" />
      <path d={FLARE_NARROW} />
      {FOOT}
      {/* The mitre's slit, cut on the diagonal as it is on a real bishop. */}
      <path
        d="M19 15.2 L25.8 20.8"
        stroke="var(--piece-detail)"
        strokeWidth="1.5"
        fill="none"
      />
    </>
  ),
  q: (
    <>
      {/* Five points, each tipped with a pearl. */}
      <circle cx="8.4" cy="13.4" r="2.3" />
      <circle cx="15.4" cy="9.6" r="2.3" />
      <circle cx="22.5" cy="8.2" r="2.3" />
      <circle cx="29.6" cy="9.6" r="2.3" />
      <circle cx="36.6" cy="13.4" r="2.3" />
      <path d="M8.4 13.4 L12.8 26.4 h19.4 L36.6 13.4 L30.6 22.2 L29.6 9.6 L23.6 21.2 h-2.2 L15.4 9.6 L14.4 22.2 z" />
      <path d="M12.8 26.4 h19.4 v2.2 h-19.4 z" />
      <path d={FLARE_WIDE} />
      {FOOT}
    </>
  ),
  k: (
    <>
      <path d="M21.3 3.4 h2.4 v3.4 H27 v2.4 h-3.3 v3.4 h-2.4 V9.2 H18 V6.8 h3.3 z" />
      <path d="M22.5 13.4 c-6.6 0-11.9 4.7-11.9 10.5 c0 2.1 0.6 3.7 1.5 5 h20.8 c0.9-1.3 1.5-2.9 1.5-5 c0-5.8-5.3-10.5-11.9-10.5 z" />
      <path d={FLARE_WIDE} />
      {FOOT}
      {/* The band around the crown. */}
      <path
        d="M13.6 21.8 h17.8"
        stroke="var(--piece-detail)"
        strokeWidth="1.4"
        fill="none"
      />
    </>
  ),
}

export default function Piece({ type, color, className = '' }) {
  return (
    <svg
      className={`piece piece--${color} ${className}`.trim()}
      viewBox="0 0 45 45"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="currentColor"
        stroke="var(--piece-stroke)"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {SHAPES[type]}
      </g>
    </svg>
  )
}

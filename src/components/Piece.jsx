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
 * piece is recognised by its silhouette before anyone looks at the detail.
 *
 * The outline is not decoration. A white piece measures about 1.1:1 against a
 * light square, so without a dark contour it would simply disappear; the
 * contour is what makes one set of shapes readable on both colours of square.
 *
 * All shapes share a 45x45 view box, the convention for chess piece sets.
 */

/* Every piece lands on the same base: one flare out to full width and one band
   under it. Two shapes and one dividing line, not four — a stack of thin slabs
   reads as stripes rather than as something turned on a lathe.
   Each body is drawn to finish on the flare's own top edge, so the piece and
   its base are one continuous silhouette instead of a shape set on a coaster. */
const FLARE_WIDE = 'M13.5 28.4 h18 c0.4 2.3 1.7 3.4 3.3 4 h-24.6 c1.6-0.6 2.9-1.7 3.3-4 z'
const FLARE_NARROW = 'M16 28.4 h13 c0.4 2.3 1.7 3.4 3.3 4 h-19.6 c1.6-0.6 2.9-1.7 3.3-4 z'

const FOOT = <rect x="9" y="32.4" width="27" height="5" rx="2" />
/* The pawn is the one piece with a narrower base, as it is on a real board. */
const FOOT_NARROW = <rect x="11.4" y="32.4" width="22.2" height="5" rx="2" />

const SHAPES = {
  p: (
    <>
      <circle cx="22.5" cy="10.5" r="5" />
      <path d="M22.5 16.4 c-2.6 0-4.8 2-4.8 4.5 c0 1.5 0.8 2.9 2.1 3.7 c-2.4 1.2-3.8 2.3-3.8 3.8 h13 c0-1.5-1.4-2.6-3.8-3.8 c1.3-0.8 2.1-2.2 2.1-3.7 c0-2.5-2.2-4.5-4.8-4.5 z" />
      <path d={FLARE_NARROW} />
      {FOOT_NARROW}
    </>
  ),
  r: (
    <>
      {/* Three merlons and the two embrasures between them. */}
      <path d="M11.4 8 h4.6 v3.4 h4.2 V8 h4.6 v3.4 h4.2 V8 h4.6 v7.4 h-22.2 z" />
      <path d="M14.6 15.4 h15.8 l1.1 13 h-18 z" />
      <path d={FLARE_WIDE} />
      {FOOT}
    </>
  ),
  n: (
    <>
      {/* The head in profile, traced clockwise from the ear: down the back of
          the neck into the base, then up the chest to the throat, out under the
          jaw to the chin, up the bridge of the nose and back to the ear. The
          jaw overhanging the chest is what stops it reading as a bird. */}
      <path d="M26.6 5.4 l0.9 4.3 c3.6 2.4 5.6 7.6 5.6 14.2 c0 1.8-0.2 3.2-0.5 4.5 h-19.1 c0.2-3.4 1.7-5.5 4.3-6.2 c-2.7 0.5-5.2 0.8-7.3 0.6 c-1.5-0.2-1.8-1.7-0.7-3.1 c0.9-1.2 2.3-2.4 3.8-3.4 l5.4-3.8 c1-2.4 2.2-4.4 3.4-5.9 l1.1 1.9 z" />
      <path
        d="M27.2 10.6 c2.9 2.7 4.5 7.1 4.7 12.9"
        stroke="var(--piece-detail)"
        strokeWidth="1.3"
        fill="none"
      />
      <circle cx="16.4" cy="17.4" r="1.25" fill="var(--piece-detail)" stroke="none" />
      <path d={FLARE_WIDE} />
      {FOOT}
    </>
  ),
  b: (
    <>
      <circle cx="22.5" cy="6" r="2.4" />
      <path d="M22.5 9.2 c4.6 3.8 7.4 9 7.4 13.3 c0 2.5-1.4 4.4-3.4 5.9 h-8 c-2-1.5-3.4-3.4-3.4-5.9 c0-4.3 2.8-9.5 7.4-13.3 z" />
      <path d={FLARE_NARROW} />
      {FOOT}
      {/* The mitre's slit, cut on the diagonal as it is on a real bishop. */}
      <path
        d="M19 15.4 L25.8 21"
        stroke="var(--piece-detail)"
        strokeWidth="1.5"
        fill="none"
      />
    </>
  ),
  q: (
    <>
      {/* Five points, each tipped with a pearl, and the four valleys between
          them. The centre point is the one that is easy to lose: without it the
          crown runs flat under the middle pearl and leaves it floating. */}
      <circle cx="8.4" cy="13.4" r="2.3" />
      <circle cx="15.4" cy="9.6" r="2.3" />
      <circle cx="22.5" cy="8.2" r="2.3" />
      <circle cx="29.6" cy="9.6" r="2.3" />
      <circle cx="36.6" cy="13.4" r="2.3" />
      <path d="M8.4 13.4 L12 22 L15.4 9.6 L19.2 21.8 L22.5 8.2 L25.8 21.8 L29.6 9.6 L33 22 L36.6 13.4 L31.5 28.4 H13.5 z" />
      <path d={FLARE_WIDE} />
      {FOOT}
    </>
  ),
  k: (
    <>
      <path d="M21.3 3.4 h2.4 v3.4 H27 v2.4 h-3.3 v3.4 h-2.4 V9.2 H18 V6.8 h3.3 z" />
      <path d="M22.5 13.2 c-6.8 0-12.2 4.8-12.2 10.8 c0 1.8 1.2 3.3 3.2 4.4 h18 c2-1.1 3.2-2.6 3.2-4.4 c0-6-5.4-10.8-12.2-10.8 z" />
      <path d={FLARE_WIDE} />
      {FOOT}
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

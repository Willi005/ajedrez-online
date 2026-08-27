/**
 * The six chess pieces, drawn as inline SVG.
 *
 * The obvious alternative is the Unicode block at U+2654..U+265F, but glyph
 * coverage for it is inconsistent: on a machine without a symbol font the board
 * renders as empty boxes, and where a colour-emoji font wins the fallback the
 * white pieces come out black. Drawing the shapes removes that dependency and
 * lets both colours be tinted from CSS.
 *
 * All shapes share a 45x45 view box, the convention for chess piece sets.
 */

const BASE = 'M10.5 34.5 h24 a1.5 1.5 0 0 1 1.5 1.5 v2.5 a1.5 1.5 0 0 1 -1.5 1.5 h-24 a1.5 1.5 0 0 1 -1.5 -1.5 v-2.5 a1.5 1.5 0 0 1 1.5 -1.5 z'

const SHAPES = {
  p: (
    <>
      <circle cx="22.5" cy="12.5" r="5.5" />
      <path d="M18 18 h9 l-1 4.5 c3 2.8 4.5 6.5 5 11.5 h-17 c0.5-5 2-8.7 5-11.5 z" />
      <path d={BASE} />
    </>
  ),
  r: (
    <>
      <path d="M12 8 h5 v3.5 h3.5 V8 h4 v3.5 H28 V8 h5 v8 h-2.5 v13 H33 v5 H12 v-5 h2.5 V16 H12 z" />
      <path d={BASE} />
    </>
  ),
  n: (
    <>
      <path d="M13.5 34 c0-6.5 2-11.5 6-15 l-3.5-3.5 c-1.2 1.8-3 2.4-4 1.2 c-1.2-1.8 0.6-4.8 3-6.6 l3-2.2 L19 4.5 l3 3.4 c7 0.3 11.5 6.5 11.5 15.5 c0 4.2-0.2 7.5-0.6 10.6 z" />
      <circle cx="18.6" cy="15.4" r="1.3" fill="var(--piece-detail)" stroke="none" />
      <path d={BASE} />
    </>
  ),
  b: (
    <>
      <circle cx="22.5" cy="6" r="2.2" />
      <path d="M22.5 9 c4 3.4 6.5 8 6.5 12 c0 3.6-2.9 6-6.5 6 s-6.5-2.4-6.5-6 c0-4 2.5-8.6 6.5-12 z" />
      <path d="M16.5 27 h12 v3 h-12 z" />
      <path d="M17 30 h11 c0 2.6 1.4 3.9 3 4.5 h-17 c1.6-0.6 3-1.9 3-4.5 z" />
      <path d={BASE} />
      <path
        d="M22.5 13 v7 M19 16.5 h7"
        stroke="var(--piece-detail)"
        strokeWidth="1.4"
        fill="none"
      />
    </>
  ),
  q: (
    <>
      <circle cx="8.5" cy="13" r="2.3" />
      <circle cx="15.5" cy="9.5" r="2.3" />
      <circle cx="22.5" cy="8" r="2.3" />
      <circle cx="29.5" cy="9.5" r="2.3" />
      <circle cx="36.5" cy="13" r="2.3" />
      <path d="M8.5 13 L13 27 h19 L36.5 13 L30.5 22.5 L29.5 9.5 L22.5 21.5 L15.5 9.5 L14.5 22.5 z" />
      <path d="M12.5 27 h20 v3 h-20 z" />
      <path d="M13 30 h19 c0 2.6 1.2 3.9 2.5 4.5 h-24 c1.3-0.6 2.5-1.9 2.5-4.5 z" />
      <path d={BASE} />
    </>
  ),
  k: (
    <>
      <path d="M21.4 3.5 h2.2 v3.4 H27 v2.2 h-3.4 v3.4 h-2.2 V9.1 H18 V6.9 h3.4 z" />
      <path d="M22.5 13 c-6.4 0-11.5 4.6-11.5 10.4 c0 2.5 0.7 4.2 1.6 5.6 h19.8 c0.9-1.4 1.6-3.1 1.6-5.6 C34 17.6 28.9 13 22.5 13 z" />
      <path d="M12.5 29 h20 v3 h-20 z" />
      <path d="M13 32 h19 c0 1.4 0.6 2.1 1.5 2.5 h-22 c0.9-0.4 1.5-1.1 1.5-2.5 z" />
      <path d={BASE} />
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

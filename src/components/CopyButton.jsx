import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

/**
 * Copies a string and says so for a moment.
 *
 * The text arrives as a function rather than as a value because two of the
 * three callers hand over a PGN, which is worth building at the moment somebody
 * asks for it and not on every render of the move list.
 */
export default function CopyButton({
  getText,
  label = 'Copiar',
  copiedLabel = 'Copiado',
  className = 'btn btn-secondary',
  disabled = false,
}) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  // The timer outlives a click but not the component: leaving it to fire on an
  // unmounted button is how you get a state update on a screen that is gone.
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied, and there is nothing to do about it
      // here: everything this button copies is also legible on screen.
    }
  }

  return (
    <button type="button" className={className} disabled={disabled} onClick={handleCopy}>
      <Icon name={copied ? 'check' : 'copy'} />
      {copied ? copiedLabel : label}
    </button>
  )
}

import Icon from './Icon.jsx'

/**
 * Control to toggle between light and dark themes.
 *
 * Placed in the top right corner so it remains accessible across all screens
 * (Home, WaitingRoom, GameScreen) without obstructing primary actions.
 */
export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark'
  const nextTheme = isDark ? 'claro' : 'oscuro'

  return (
    <button
      type="button"
      className="btn btn-secondary btn-icon theme-toggle"
      onClick={onToggle}
      aria-label={`Cambiar a modo ${nextTheme}`}
      title={`Cambiar a modo ${nextTheme}`}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={15} />
    </button>
  )
}

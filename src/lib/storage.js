/**
 * Thin wrapper over localStorage.
 *
 * Every access is guarded: a browser in private mode, or with site data
 * blocked, throws on access instead of returning null. Losing the stored
 * nickname is not a reason to break the whole app, so failures degrade to the
 * caller-supplied fallback.
 */

const NICKNAME_KEY = 'ajedrez.nickname'
const SERVER_URL_KEY = 'ajedrez.serverUrl'
const THEME_KEY = 'ajedrez.theme'

function read(key, fallback = null) {
  try {
    const value = window.localStorage.getItem(key)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Nothing to do: the session simply will not be remembered.
  }
}

function remove(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Same as above.
  }
}

export function readNickname() {
  return read(NICKNAME_KEY, '')
}

export function writeNickname(nickname) {
  write(NICKNAME_KEY, nickname)
}

export function clearNickname() {
  remove(NICKNAME_KEY)
}

/** Returns the user's server URL override, or null when they never set one. */
export function readServerUrl() {
  return read(SERVER_URL_KEY, null)
}

export function writeServerUrl(url) {
  write(SERVER_URL_KEY, url)
}

export function clearServerUrl() {
  remove(SERVER_URL_KEY)
}

/** Returns the system preferred theme ('dark' or 'light'). */
export function getSystemTheme() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  } catch {
    return 'light'
  }
}

/** Returns the stored theme, or the system theme when none was set. */
export function readTheme() {
  const saved = read(THEME_KEY, null)
  if (saved === 'dark' || saved === 'light') return saved
  return getSystemTheme()
}

export function writeTheme(theme) {
  write(THEME_KEY, theme)
}

export function clearTheme() {
  remove(THEME_KEY)
}

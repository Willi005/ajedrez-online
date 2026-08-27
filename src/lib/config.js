/**
 * Where the socket server lives.
 *
 * The address comes from a Vite environment variable, but the user can override
 * it from the interface at run time. That override is the fallback plan for the
 * classroom demo: if the network isolates the machines, both players switch to
 * 127.0.0.1 and run everything on one computer.
 */

import { readServerUrl } from './storage.js'

export const DEFAULT_SERVER_URL = 'ws://127.0.0.1:8765'

/** The address baked in at build time, before any user override. */
export const ENV_SERVER_URL = import.meta.env.VITE_SERVER_URL || DEFAULT_SERVER_URL

/** The address to actually connect to: the user's override wins. */
export function resolveServerUrl() {
  return readServerUrl() || ENV_SERVER_URL
}

/**
 * Accept what the user typed and turn it into a WebSocket URL.
 * Bare forms such as `192.168.1.5:8765` are common enough to be worth
 * completing rather than rejecting.
 */
export function normalizeServerUrl(input) {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (/^wss?:\/\//i.test(trimmed)) return trimmed
  return `ws://${trimmed}`
}

export function isValidServerUrl(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:'
  } catch {
    return false
  }
}

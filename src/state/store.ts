import { useSyncExternalStore } from 'react'

/** A tiny persistent store backed by localStorage (works offline, no account). */
export interface Store<T> {
  get(): T
  set(update: T | ((prev: T) => T)): void
  subscribe(fn: () => void): () => void
}

const PREFIX = 'pianoCoach.'

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false // storage full or disabled (private mode): keep working in memory
  }
}

export function createStore<T>(key: string, initial: T, migrate: (stored: T) => T = (s) => s): Store<T> {
  let value = migrate(readJson(key, initial))
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(update) {
      value = typeof update === 'function' ? (update as (prev: T) => T)(value) : update
      writeJson(key, value)
      listeners.forEach((fn) => fn())
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

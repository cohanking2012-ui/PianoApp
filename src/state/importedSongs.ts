import { parseSong, type Song, type SongJson } from '../music/song'
import { createStore, useStore } from './store'

export const importedStore = createStore<SongJson[]>('importedSongs', [], (list) =>
  Array.isArray(list) ? list.filter((j) => { try { parseSong(j); return true } catch { return false } }) : []
)

let cacheKey: SongJson[] | null = null
let cache: Song[] = []

/** Imported songs as parsed Song objects (memoised). */
export function getImportedSongs(): Song[] {
  const list = importedStore.get()
  if (list !== cacheKey) {
    cacheKey = list
    cache = list.map((j) => parseSong(j, true))
  }
  return cache
}

export function useImportedSongs(): Song[] {
  useStore(importedStore)
  return getImportedSongs()
}

export function addImportedSong(json: SongJson) {
  parseSong(json, true) // throws if invalid
  importedStore.set((list) => [...list, json])
}

export function removeImportedSong(id: string) {
  importedStore.set((list) => list.filter((j) => j.id !== id))
}

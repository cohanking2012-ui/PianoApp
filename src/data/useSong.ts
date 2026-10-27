import { getBuiltInSong, LESSON_ORDER, SONG_LIBRARY } from './library'
import { useImportedSongs } from '../state/importedSongs'
import type { Song } from '../music/song'

export function useSong(id: string | undefined): Song | undefined {
  const imported = useImportedSongs()
  if (!id) return undefined
  return getBuiltInSong(id) ?? imported.find((s) => s.id === id)
}

export function nextLesson(id: string): Song | undefined {
  const i = LESSON_ORDER.findIndex((s) => s.id === id)
  return i >= 0 ? LESSON_ORDER[i + 1] : undefined
}

/** The next song in the library list (same category first), for "Next song" after a result. */
export function nextLibrarySong(id: string): Song | undefined {
  const song = SONG_LIBRARY.find((s) => s.id === id)
  if (!song) return undefined
  const same = SONG_LIBRARY.filter((s) => s.category === song.category)
  return same[(same.indexOf(song) + 1) % same.length]
}

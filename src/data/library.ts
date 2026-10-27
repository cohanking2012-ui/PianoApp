import curriculumJson from './curriculum.json'
import { parseSong, type Song, type SongJson } from '../music/song'

/** Lessons: every JSON file in ./songs, ordered by curriculum.json. */
const lessonFiles = import.meta.glob<SongJson>('./songs/*.json', { eager: true, import: 'default' })
/** The song library: every JSON file in ./library (plus lessons that have a category). */
const libraryFiles = import.meta.glob<SongJson>('./library/*.json', { eager: true, import: 'default' })

export const BUILT_IN_SONGS: Song[] = Object.values(lessonFiles).map((json) => parseSong(json))
const LIBRARY_ONLY: Song[] = Object.values(libraryFiles).map((json) => parseSong(json))
const byId = new Map([...BUILT_IN_SONGS, ...LIBRARY_ONLY].map((s) => [s.id, s]))

export interface Unit {
  title: string
  lessons: Song[]
}

export const CURRICULUM: Unit[] = curriculumJson.units.map((u) => ({
  title: u.title,
  lessons: u.lessons.map((id) => {
    const song = byId.get(id)
    if (!song) throw new Error(`Curriculum lists unknown lesson "${id}"`)
    return song
  }),
}))

/** Lessons in teaching order. */
export const LESSON_ORDER: Song[] = CURRICULUM.flatMap((u) => u.lessons)

/** Display order of library categories. */
export const CATEGORIES = ['Kids & nursery', 'Folk & traditional', 'Classical', 'Christmas', 'Hymns & spirituals', 'Patriotic & anthems']

/** Every song in the library (songs from lessons included), sorted by title. */
export const SONG_LIBRARY: Song[] = [...BUILT_IN_SONGS.filter((s) => s.category), ...LIBRARY_ONLY].sort((a, b) =>
  a.title.replace(/^(the|a) /i, '').localeCompare(b.title.replace(/^(the|a) /i, ''))
)

export function getBuiltInSong(id: string): Song | undefined {
  return byId.get(id)
}

export function isLesson(id: string): boolean {
  return LESSON_ORDER.some((s) => s.id === id)
}

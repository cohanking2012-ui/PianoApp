import curriculumJson from './curriculum.json'
import { parseSong, type Song, type SongJson } from '../music/song'

/** Every JSON file in ./songs is a built-in song or lesson. */
const files = import.meta.glob<SongJson>('./songs/*.json', { eager: true, import: 'default' })

export const BUILT_IN_SONGS: Song[] = Object.values(files).map((json) => parseSong(json))
const byId = new Map(BUILT_IN_SONGS.map((s) => [s.id, s]))

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

export function getBuiltInSong(id: string): Song | undefined {
  return byId.get(id)
}

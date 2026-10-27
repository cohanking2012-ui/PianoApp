import type { SessionResult } from '../music/session'
import { createStore, useStore } from './store'

export interface LessonProgress {
  completed: boolean
  bestAccuracy: number
  stars: number
  plays: number
  lastPlayed: number
}

export type Progress = Record<string, LessonProgress>

export const progressStore = createStore<Progress>('progress', {})

export function useProgress() {
  return useStore(progressStore)
}

/** Saves a finished run. Returns true if it beat the previous best. */
export function recordResult(songId: string, result: SessionResult): boolean {
  const prev = progressStore.get()[songId]
  const isBest = !prev || result.accuracy > prev.bestAccuracy
  progressStore.set((p) => ({
    ...p,
    [songId]: {
      completed: true,
      bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, result.accuracy),
      stars: Math.max(prev?.stars ?? 0, result.stars),
      plays: (prev?.plays ?? 0) + 1,
      lastPlayed: Date.now(),
    },
  }))
  return isBest
}

export function resetProgress() {
  progressStore.set({})
}
